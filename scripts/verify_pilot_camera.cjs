'use strict';
// Observer-only native check. Never moves, equips or supplies the resident.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const mineflayer=require('mineflayer');
const viewer='LabPilotView',output=path.resolve(process.argv[2]||'logs/pilot-camera-native.json');
const token=fs.readFileSync('data/api-token','utf8').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={complete:false,started_at:Date.now(),viewer,target:'HomeAI01',setup:'Spectator viewer only; no resident or terrain changes'};
let bot,cameraId;
async function request(route,body){
  const r=await fetch('http://127.0.0.1:8000'+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Lab-Token':token}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});
  const s=await r.json();if(!r.ok)throw Error(JSON.stringify(s));return s;
}
async function until(check,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const result=await check();if(result)return result;await sleep(250);}throw Error('Native camera check timed out');}
(async()=>{
  try{
    const before=await request('/status?compact=true');report.paper_pid=before.server.pid;
    assert.equal(before.server.ready,true);
    const control=JSON.parse(fs.readFileSync('data/persistent-pilot/control.json','utf8'));
    report.world_uuid=control.world_uuid;
    bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:viewer,auth:'offline',version:'1.21.4'});
    bot._client.on('camera',p=>{cameraId=p.cameraId;});
    bot.on('error',e=>{report.client_error=e.message;});
    await until(()=>bot.entity&&bot.game,10000);
    await until(async()=> (await request('/status?compact=true')).players.some(p=>p.name===viewer));
    await request('/admin/action',{action:'gamemode',player:viewer,gamemode:'spectator'});
    await until(()=>bot.game.gameMode==='spectator');
    await request('/observer/start',{player:viewer,target:'HomeAI01',view:'shoulder',distance:3,height:3,cycle_enabled:false,night_vision:true});
    const session=await until(async()=>{
      const s=(await request('/status?compact=true')).observer.sessions.find(s=>s.player===viewer);
      return s?.status==='following'&&cameraId!==undefined&&cameraId!==bot.entity.id&&bot.entities[cameraId]?s:null;
    },15000);
    assert.equal(session.view,'shoulder');assert.equal(session.target,'HomeAI01');
    assert.equal(session.cycle_enabled,false);
    const camera=bot.entities[cameraId],block=bot.blockAt(camera.position);
    assert.ok(block,'Camera terrain must be loaded');
    assert.equal(block.boundingBox,'empty','Viewer camera must be outside solid blocks');
    const nightId=bot.registry.effectsByName.NightVision.id;
    await until(()=>bot.entity.effects?.[nightId]);
    const world=await request('/pilot/world',{action:'status',world:'lab_persistent_pilot'});
    assert.equal(world.world_uuid,control.world_uuid);assert.ok(world.players.includes(viewer));
    assert.ok(world.players.includes('HomeAI01'));
    Object.assign(report,{camera_id:cameraId,camera_position:camera.position.toArray(),camera_block:block.name,
      native_dimension:bot.game.dimension,requested_view:session.view,effective_view:session.effective_view,
      native_night_vision:true,session_status:session.status,message:session.message});
    const after=await request('/status?compact=true');
    assert.equal(after.server.pid,report.paper_pid);assert.equal(after.server.ready,true);
    assert.equal(after.world_learning.enabled,before.world_learning.enabled);
    report.production_learning_unchanged=true;report.complete=true;
  }catch(e){report.error=e.stack||e.message;process.exitCode=1;}
  finally{
    try{await request('/observer/stop',{player:viewer});report.camera_stopped=true;}catch(e){report.cleanup_error=e.message;report.complete=false;process.exitCode=1;}
    if(bot){
      bot.quit('Observer check complete');
      try{
        await until(async()=>!(await request('/status?compact=true')).players.some(p=>p.name===viewer),8000);
        report.viewer_disconnected=true;
      }catch(e){report.cleanup_error=e.message;report.complete=false;process.exitCode=1;}
    }
    report.finished_at=Date.now();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

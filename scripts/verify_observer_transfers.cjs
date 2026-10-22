// Exercise same-entity arena transfers while the learning controller is paused.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer');
const {once}=require('events');const token=fs.readFileSync('data/api-token','utf8').trim();
const viewer='LabViewProbe',target='LabAI0',sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function status(){return(await fetch('http://127.0.0.1:8000/status')).json();}
async function post(path,data){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});const out=await r.json();if(!r.ok)throw Error(JSON.stringify(out));return out;}
async function teleport(position){return post('/admin/action',{action:'teleport-coordinates',player:target,x:position[0],y:position[1],z:position[2]});}
const distance=(a,b)=>Math.hypot(a.x-b[0],a.z-b[2]);
(async()=>{
 let bot,original,mode,targetOriginal;const results=[];
 try{
  let state=await status();assert.equal(state.curriculum.enabled,false,'Pause autonomy before this check');assert.equal(state.mode,'paused');
  for(let i=0;state.server.bots_online<state.agent_count&&i<30;i++){await sleep(1000);state=await status();}
  targetOriginal=state.agents[target].position;const entityId=state.agents[target].entity_id;
  bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:viewer,auth:'offline',version:'1.21.4'});let cameraId;
  bot._client.on('camera',p=>cameraId=p.cameraId);bot.on('error',console.error);await once(bot,'spawn');await sleep(2000);original=bot.entity.position.clone();mode=bot.game.gameMode;
  for(const view of ['first_person','trail','side','overhead','orbit','stationary']){
   await teleport([304.5,181,0]);await sleep(500);
   await post('/observer/start',{player:viewer,target,view,distance:7,height:4});await sleep(2200);
   const initialCamera=bot.entities[cameraId]?.position.clone(),initialBody=bot.entity.position.clone();assert.ok(initialCamera,'Initial camera is tracked');
   await teleport([464.5,181,0]);await sleep(2500);
   state=await status();const session=state.observer.sessions.find(s=>s.player===viewer),camera=bot.entities[cameraId];
   assert.equal(state.agents[target].entity_id,entityId,'Target keeps its entity ID during transfer');assert.equal(session.status,'following');assert.ok(camera,'Transferred camera is tracked');
   if(view==='stationary'){
    assert.ok(camera.position.distanceTo(initialCamera)<.3,'Stationary position is unchanged');
   }else{
    assert.ok(distance(bot.entity.position,[464.5,181,0])<(view==='first_person'?3:20),'Viewer is explicitly relocated into new simulation chunks');
    assert.ok(distance(camera.position,[464.5,181,0])<20,'Render camera is near target');
    assert.ok(bot.blockAt(bot.entity.position.offset(0,-1,0)),'New viewpoint chunks are loaded');
   }
   results.push({view,passed:true,target_entity_id:entityId,camera_id:cameraId,viewer_from:initialBody.toArray(),viewer_to:bot.entity.position.toArray(),camera_to:camera.position.toArray()});console.log(JSON.stringify(results.at(-1)));
  }
  await post('/observer/stop',{player:viewer});await sleep(1000);assert.equal(bot.game.gameMode,mode);assert.ok(bot.entity.position.distanceTo(original)<2);
  fs.writeFileSync('docs/observer-transfer-regression.json',JSON.stringify({results,restored_mode:mode,return_distance:bot.entity.position.distanceTo(original)},null,2));
 }finally{
  if(bot){await post('/observer/stop',{player:viewer}).catch(()=>{});bot.quit();}
  if(targetOriginal)await teleport(targetOriginal);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

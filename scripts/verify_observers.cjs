const fs=require('fs'),mineflayer=require('mineflayer');const {once}=require('events');const assert=require('assert/strict');
const token=fs.readFileSync('data/api-token','utf8').trim(),name='LabViewProbe';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});const s=await r.json();if(!r.ok)throw Error(JSON.stringify(s));return s;}
async function status(){return (await fetch('http://127.0.0.1:8000/status')).json();}
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4'});let cameraId;bot._client.on('camera',p=>cameraId=p.cameraId);bot.on('error',e=>console.error(e));
(async()=>{const results=[];try{
 await once(bot,'spawn');await delay(2500);const original=bot.entity.position.clone(),mode=bot.game.gameMode;
 for(const view of (process.argv.includes('--transfer-only')?[]:['first_person','trail','side','overhead','orbit','stationary'])){
  await post('/observer/start',{player:name,target:'LabAI0',view,distance:7,height:4});await delay(2500);
  const s=await status(),session=s.observer.sessions.find(s=>s.player===name);
  assert.equal(session.status,'following');assert.equal(bot.game.gameMode,'spectator');assert.ok(cameraId!==undefined&&cameraId!==bot.entity.id,'camera attached');
  if(view==='first_person')assert.equal(cameraId,s.agents.LabAI0.entity_id);
  const cam=bot.entities[cameraId],position=cam?cam.position.clone():null;
  if(view==='stationary'){
   assert.ok(position,'stationary camera entity visible');await post('/observer/start',{player:name,target:'LabAI1',view});await delay(2000);const after=bot.entities[cameraId]?.position;assert.ok(after&&after.distanceTo(position)<.2,'stationary camera remains fixed while switching bots');
  }
  results.push({view,camera_id:cameraId,status:session.status,position:position?.toArray?.()||position,game_mode:bot.game.gameMode});console.log(JSON.stringify(results.at(-1)));
 }
 if(process.argv.includes('--transfer')||process.argv.includes('--transfer-only')){
  await post('/observer/start',{player:name,target:'LabAI0',view:'first_person'});await delay(1500);
  const before=(await status()).agents.LabAI0.position;let evidence;
  for(let i=0;i<120;i++){
   const state=await status(),target=state.agents.LabAI0;
   if(Math.abs(target.position[0]-before[0])>100){
    await delay(1500);assert.equal(cameraId,target.entity_id);
    const camera=bot.entities[cameraId];assert.ok(camera&&Math.hypot(camera.position.x-target.position[0],camera.position.z-target.position[2])<5,'render camera entity follows arena transfer: '+JSON.stringify({camera:camera?.position,body:bot.entity.position,target:target.position}));
    evidence={arena_transfer:true,from:before,to:target.position,camera_id:cameraId,viewer_position:bot.entity.position.toArray(),camera_position:bot.entities[cameraId].position.toArray()};break;
   }
   await delay(1000);
  }
  assert.ok(evidence,'no automatic arena transfer within two minutes');results.push(evidence);console.log(JSON.stringify(evidence));
 }
 await post('/observer/stop',{player:name});await delay(2000);
 assert.equal(bot.game.gameMode,mode);assert.ok(bot.entity.position.distanceTo(original)<2,'original return point restored');
 results.push({restored_mode:bot.game.gameMode,return_distance:bot.entity.position.distanceTo(original)});
 fs.writeFileSync(process.argv.includes('--transfer-only')?'docs/observer-transfer-check.json':'docs/observer-live-check.json',JSON.stringify(results,null,2));
 }finally{await post('/observer/stop',{player:name}).catch(()=>{});bot.quit();}
})().catch(e=>{console.error(e);process.exitCode=1;});

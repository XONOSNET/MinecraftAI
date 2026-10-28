// Read-only live survey check. No terrain, inventory or model changes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),{findSpawn}=require('../controller/hut_teacher');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSurveyCheck',version:'1.21.4'}),result={fixture:'Read-only hover survey above the reported ocean site; return to the existing staging pad afterward'};
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const message=await r.text();if(!message.includes('not online'))throw Error(message);await wait(500);}throw Error('Temporary observer was not listed online');}
let finished=false;
async function finish(){if(finished)return;finished=true;survey.release(b);fs.writeFileSync('docs/survey-ocean-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 survey.hold(b);await wait(1800);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:24640,y:196,z:16448});
 const deadline=Date.now()+10000;while(b.entity.position.distanceTo(new Vec3(24640,196,16448))>.1){if(Date.now()>deadline)throw Error('Survey teleport was not applied');await wait(100);}
 let delta=0;const started=Date.now();while(Date.now()-started<6000){delta=Math.max(delta,Math.abs(b.entity.position.y-196));await wait(50);}
 result.hover={seconds:6,max_height_change:delta,gravity:b.physics.gravity,physics_enabled:b.physicsEnabled,mode:b.game.gameMode};
 const at=Date.now();result.dry_spawn=findSpawn(b,[24576,24704,16384,16512],{margin:24});result.search_ms=Date.now()-at;
 result.water_samples=0;result.loaded_samples=0;for(let x=24604;x<=24676;x+=6)for(let z=16412;z<=16484;z+=6){const block=b.blockAt(new Vec3(x,62,z));if(block){result.loaded_samples++;if(block.name==='water')result.water_samples++;}}
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await wait(500);survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(1000);
 result.restored={gravity:b.physics.gravity,on_ground:b.entity.onGround,position:b.entity.position.clone()};result.success=delta<.05&&result.restored.gravity===.08&&result.restored.on_ground;
 }catch(error){result.error=error.stack;}finally{await finish();}});
setTimeout(()=>{result.error='Survey verification deadline';finish();},60000).unref();

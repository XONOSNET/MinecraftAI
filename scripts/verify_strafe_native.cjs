// Read-only terrain fixture: real survival movement, no block or inventory edits.
const fs=require('fs'),mineflayer=require('mineflayer'),{createMotor}=require('../controller/locomotion'),{proximity}=require('../controller/perception');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabStrafeCheck',version:'1.21.4'});
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok){const message=await r.text();if(message.includes('not online')&&(data._retries||0)<8){await wait(500);return post({...data,_retries:(data._retries||0)+1});}throw Error(message);}};
b.once('spawn',async()=>{const result={fixture:'Native survival strafing on existing flat lab floor; no terrain edits, model calls or grants.'};let motor;
 try{
  await wait(2000);await post({action:'gamemode',player:b.username,gamemode:'survival'});await post({action:'teleport-coordinates',player:b.username,x:-12.5,y:181,z:17.5});await wait(1000);await b.look(0,0,true);await wait(100);
  motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());const start=b.entity.position.clone();let lateralFrames=0;const sample=()=>{if(b.getControlState('left')||b.getControlState('right'))lateralFrames++;};b.on('physicsTick',sample);
  const task={kind:'gather',safe_walk:true,bounds:[-24,24,-24,24]};
  for(let i=0;i<6;i++){motor.command(0,task,{...proximity(b),wallAhead:true,cueDistance:8},0);await wait(100);}
  motor.pause();result.sidestep={x:b.entity.position.x-start.x,z:b.entity.position.z-start.z,yaw:b.entity.yaw,lateral_frames:lateralFrames};
  await wait(300);await b.look(0,0,true);await wait(100);const p=b.entity.position.clone();
  for(let i=0;i<5;i++){motor.command(1,task,{...proximity(b),frontHazard:false,frontBlocked:false,headBlocked:false,cueDistance:8},.3);await wait(100);}
  result.diagonal={x:b.entity.position.x-p.x,z:b.entity.position.z-p.z};motor.pause();result.keys_released=!b.getControlState('left')&&!b.getControlState('right');b.removeListener('physicsTick',sample);
  result.success=Math.abs(result.sidestep.x)>.3&&Math.abs(result.sidestep.z)<.15&&Math.abs(result.sidestep.yaw)<.01&&lateralFrames>2&&result.diagonal.x<-.1&&result.diagonal.z<-.1&&result.keys_released;
 }catch(e){result.error=e.stack;}finally{motor?.pause();fs.writeFileSync('docs/strafe-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),200);}
});setTimeout(()=>{b.quit();process.exit(1);},30000).unref();

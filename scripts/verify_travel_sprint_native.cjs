// Read-only terrain fixture: real survival movement, no block or inventory edits.
const fs=require('fs'),mineflayer=require('mineflayer'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),tasks=require('../controller/tasks'),{Vec3}=require('vec3');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSprintChk',version:'1.21.4'});
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok){const message=await r.text();if(message.includes('not online')&&(data._retries||0)<8){await wait(500);return post({...data,_retries:(data._retries||0)+1});}throw Error(message);}};
b.once('spawn',async()=>{const result={fixture:'Actual world-route teacher and shared motor on an existing flat lab floor; no terrain, model or inventory changes.'};let motor;
 try{
  await wait(2000);await post({action:'gamemode',player:b.username,gamemode:'survival'});await post({action:'teleport-coordinates',player:b.username,x:-12.5,y:181,z:17.5});await wait(1200);
  for(let z=-16;z<=18;z++)for(let x=-13;x<=-12;x++){if(b.blockAt(new Vec3(x,180,z))?.boundingBox!=='block'||[181,182].some(y=>b.blockAt(new Vec3(x,y,z))?.boundingBox!=='empty'))throw Error('Read-only runway obstructed');}
  const state={run:'sprint-native',world:{bounds:[-24,24,-24,24],driver:'teacher'}},api=async(path,d)=>({action:d.teacher});
  async function travel(sprint,distance){
   motor?.pause();await post({action:'teleport-coordinates',player:b.username,x:-12.5,y:181,z:17.5});await wait(600);await b.look(0,0,true);await wait(100);
   const t=new HutTeacher();Object.assign(t,{phase:'quarry',plot:null,runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),lastRecoveryReset:0});
   const m=createMotor(b,{move:true,turn:true,jump:true,sprint:true}),original=m.command;m.command=(action,task,sensed,angle)=>original(action,{...task,travel_sprint:sprint},sensed,angle);motor=m;
   let frames=0;const tick=()=>{m.tick();if(b.getControlState('sprint'))frames++;};b.on('physicsTick',tick);
   const start=b.entity.position.clone(),at=Date.now();while(Date.now()-at<2000){await t.walk(b,m,[-12.5,181.1,17.5-distance],state,api,scan,tasks);await wait(100);}
   m.pause();b.removeListener('physicsTick',tick);return {distance:Math.round(start.distanceTo(b.entity.position)*100)/100,sprint_frames:frames,seconds:(Date.now()-at)/1000};
  }
  result.walk=await travel(false,30);result.run=await travel(true,30);result.near=await travel(true,3);result.success=result.run.sprint_frames>10&&result.run.distance>result.walk.distance*1.15&&result.walk.sprint_frames===0&&result.near.sprint_frames===0;
 }catch(e){result.error=e.stack;}finally{motor?.pause();fs.writeFileSync('docs/travel-sprint-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),200);}
});setTimeout(()=>{b.quit();process.exit(1);},40000).unref();

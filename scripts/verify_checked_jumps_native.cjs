// Disposable sky fixture; no supplies or edits in production training terrain.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3'),clearance=require('../controller/construction_clearance');
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFlowerTest',auth:'offline',version:'1.21.4'}),token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={diagnostic_only:true};let changed=false;
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const message=await r.text();if(!message.includes('not online')||i===11)throw Error(message);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(500);}}
(async()=>{try{
 await once(b,'spawn');await wait(1500);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1399.5,y:214,z:-1399.5});await wait(1600);
 for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=209;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture starts empty');
 changed=true;
 const motor=require('../controller/locomotion').createMotor(b,{move:true,jump:true,turn:true}),physics=()=>motor.tick();b.on('physicsTick',physics);
 async function crossing(goal,gap){
  let airborne=false;const start=b.entity.position.clone(),end=Date.now()+7000;
  try{while(Date.now()<end){
   const p=b.entity.position;airborne ||= b.entity.onGround===false;
   if(airborne&&b.entity.onGround&&Math.hypot(goal[0]-p.x,goal[2]-p.z)<.55&&Math.abs(goal[1]-p.y)<.4)return {passed:true,position:p.toArray(),airborne};
   const desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
   motor.command(Math.abs(angle)>.05?(angle>0?1:2):0,{kind:'expedition',auto_step:true,gap_jump:gap,safe_walk:true,strict_ground:true,waypoints:[goal]},require('../controller/perception').proximity(b),angle);await wait(100);
  }}finally{motor.pause();}
  throw Error('Checked jump failed: '+JSON.stringify({gap,start:start.toArray(),end:b.entity.position.toArray(),airborne}));
 }
 try{
  await commands(['fill -1403 210 -1403 -1397 210 -1397 dirt','setblock -1400 211 -1400 stone','tp @s -1400.5 211 -1399.5 -90 0']);await admin({action:'gamemode',gamemode:'survival'});await b.waitForTicks(5);
  report.step=await crossing([-1399.5,212.1,-1399.5],false);
  await admin({action:'gamemode',gamemode:'creative'});await commands(['setblock -1400 211 -1400 air','fill -1401 210 -1403 -1401 210 -1397 air','tp @s -1401.5 211 -1399.5 -90 0']);await admin({action:'gamemode',gamemode:'survival'});await b.waitForTicks(5);
  report.gap=await crossing([-1399.5,211.1,-1399.5],true);assert.equal(b.health,20);report.passed=true;
 }finally{motor.pause();b.removeListener('physicsTick',physics);}
 }catch(error){report.error=error.stack;process.exitCode=1;}finally{
 b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'});
 if(changed){await commands(['fill -1403 209 -1403 -1397 213 -1397 air','kill @e[type=item,x=-1403,y=-64,z=-1403,dx=6,dy=384,dz=6]','clear @s']);for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=209;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}
 await admin({action:'deop'});report.cleaned=true;b.quit();fs.writeFileSync('logs/movement-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }})().then(()=>setTimeout(()=>process.exit(process.exitCode||0),200)).catch(error=>{console.error(error);b.quit();process.exit(1)});

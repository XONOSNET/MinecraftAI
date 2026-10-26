// Isolated five-block hill: the walkable ramp is away from the home bearing.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabHomeCheck',version:'1.21.4'}),motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});b.on('physicsTick',()=>motor.tick());
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(!r.ok)throw Error(await r.text());};
b.once('spawn',async()=>{
 const result={fixture:'Survival player returns up a five-block hill using a distant staircase, via the real world controller. No teleporting during navigation.'};
 try{
  await wait(2500);await post({action:'op'});await wait(1000);
  for(const cmd of ['/gamemode survival @s','/fill -14 185 4 -2 195 18 air','/fill -14 185 4 -2 185 18 stone','/fill -5 186 4 -2 190 18 stone']){b.chat(cmd);await wait(200);}
  for(let x=-9;x<=-6;x++){b.chat(`/fill ${x} 186 16 ${x} ${185+x+10} 18 stone`);await wait(150);}
  await post({action:'deop'});await post({action:'teleport-coordinates',x:-7.5,y:186,z:6.5});await wait(1000);
  const t=new HutTeacher();Object.assign(t,{phase:'return_home',plot:{x:-4,y:191,z:6},runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
  const goal=[-3.5,191.1,6.5],started=Date.now();let farthestZ=0,jumps=0;
  while(Date.now()-started<45000){
   await t.walk(b,motor,goal,{run:'fixture',world:{driver:'teacher',bounds:[-20,2,0,24]}},async(_,d)=>({action:d.teacher}),scan,tasks);
   farthestZ=Math.max(farthestZ,b.entity.position.z);if(b.entity.velocity.y>.15)jumps++;
   if(Math.hypot(b.entity.position.x-goal[0],b.entity.position.z-goal[2])<.7&&Math.abs(b.entity.position.y-191)<.4)break;
   await wait(100);
  }
  motor.pause();result.position=b.entity.position.clone();result.seconds=(Date.now()-started)/1000;result.farthest_z=farthestZ;result.upward_samples=jumps;result.navigation=t.navigator.status;
  result.success=Math.hypot(result.position.x-goal[0],result.position.z-goal[2])<.7&&Math.abs(result.position.y-191)<.4&&farthestZ>15;
 }catch(e){result.error=e.stack;}
 finally{
  motor.pause();await post({action:'teleport-coordinates',x:-12.5,y:181,z:1.5}).catch(()=>{});await post({action:'op'}).catch(()=>{});await wait(1000);b.chat('/fill -14 185 4 -2 195 18 air');await wait(400);await post({action:'deop'}).catch(()=>{});
  fs.writeFileSync('docs/homing-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }
});
setTimeout(async()=>{await post({action:'deop'}).catch(()=>{});b.quit();process.exit(1)},65000).unref();

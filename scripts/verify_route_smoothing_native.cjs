// Compare real survival walking over the same jagged route on an existing floor.
// No block, inventory, model, replay or training-result writes.
const fs=require('fs'),path=require('path'),Module=require('module'),{execFileSync}=require('child_process');
const mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher');
const {createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks'),{WorldTiming}=require('../controller/world_timing');
const filename=path.resolve('controller/world_navigation.js'),previous=new Module(filename,module);
previous.filename=filename;previous.paths=Module._nodeModulePaths(path.dirname(filename));
previous._compile(execFileSync('git',['show','c511677:controller/world_navigation.js'],{encoding:'utf8'}),filename);
const OldNavigation=previous.exports.WorldNavigation,NewNavigation=require('../controller/world_navigation').WorldNavigation;
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSmoothCheck',version:'1.21.4'}),result={fixture:'Same 16-leg grid zigzag on existing flat floor, survival walking, identical shared motor; no training writes'};
let motor=null;
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Diagnostic unavailable');}
async function walk(Navigation){
 motor?.pause();await admin({action:'teleport-coordinates',x:-10.5,y:181,z:10.5});await wait(700);await b.look(0,0,true);
 const route=[];let x=-10.5,z=10.5;for(let i=0;i<8;i++){route.push([x,181.1,--z]);route.push([++x,181.1,z]);}
 for(const q of route)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const p=new Vec3(Math.floor(q[0])+dx,180,Math.floor(q[2])+dz);
  if(b.blockAt(p)?.boundingBox!=='block'||[1,2].some(dy=>b.blockAt(p.offset(0,dy,0))?.boundingBox!=='empty'))throw Error('Existing test floor obstructed');
 }
 const goal=route.at(-1),nav=new Navigation(),now=Date.now();
 Object.assign(nav,{path:route,destination:goal.join(','),lastPlan:now,progressAt:now,anchor:[-10.5,181,10.5]});
 const t=new HutTeacher();Object.assign(t,{phase:'quarry',plot:null,campPlots:[],navigator:nav,runtime:tasks.createRuntime(),timing:new WorldTiming(now),lastRecoveryReset:0});
 motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});
 const metrics={arrived:false,frames:0,stopped_frames:0,yaw_travel:0,smoothed_waypoints:0};let lastYaw=b.entity.yaw;
 const tick=()=>{motor.tick();metrics.frames++;if(!['forward','back','left','right'].some(k=>b.getControlState(k)))metrics.stopped_frames++;metrics.yaw_travel+=Math.abs(Math.atan2(Math.sin(b.entity.yaw-lastYaw),Math.cos(b.entity.yaw-lastYaw)));lastYaw=b.entity.yaw;};b.on('physicsTick',tick);
 try{
  while(Date.now()-now<35000){
   if(await t.walk(b,motor,goal,{run:'diagnostic-only',world:{bounds:[-20,20,-20,20],driver:'teacher'}},async(route,d)=>{if(route!=='/step')throw Error('Unexpected API');return {action:d.teacher};},scan,tasks)){metrics.arrived=true;break;}
   metrics.smoothed_waypoints+=nav.status.smoothed_waypoints||0;await wait(100);
  }
 }finally{motor.pause();b.removeListener('physicsTick',tick);}
 return {...metrics,seconds:(Date.now()-now)/1000,position:b.entity.position.clone(),health:b.health};
}
b.once('spawn',async()=>{try{
 await wait(1500);await admin({action:'gamemode',gamemode:'survival'});
 result.before=await walk(OldNavigation);result.after=await walk(NewNavigation);
 result.success=result.before.arrived&&result.after.arrived&&result.after.smoothed_waypoints>0&&result.after.yaw_travel<result.before.yaw_travel&&result.after.health===20;
 }catch(e){result.error=e.stack;}finally{
 motor?.pause();await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
 fs.writeFileSync('logs/route-smoothing-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),250);
 }});
setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

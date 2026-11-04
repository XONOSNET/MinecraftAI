// Disposable sky terraces; never modifies production terrain or inventories.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3');
const {WorldNavigation}=require('../controller/world_navigation'),{createMotor}=require('../controller/locomotion'),{proximity}=require('../controller/perception');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabDownhillTest',auth:'offline',version:'1.21.4'}),report={diagnostic_only:true};let changed=false,motor,physics;
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;await wait(400);}throw Error('Diagnostic admin unavailable');}
async function commands(list){await admin({action:'op'});await wait(800);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(400);}}
async function follow(nav,goal,oldLanding){
 const deadline=Date.now()+20000,start=b.entity.position.clone();let samples=0,descended=false;
 while(Date.now()<deadline){
  const p=b.entity.position;descended ||= p.y<start.y-.7;
  const plan=nav.plan(b,goal,{bounds:[-1568,-1550,-1568,-1550]});assert.ok(!plan.blocked,'terrace route exists');
  if(oldLanding)assert.ok(!plan.path.includes(oldLanding),'passed landing must never be reintroduced');
  if(plan.arrived){motor.pause();return {samples,descended,position:p.toArray()};}
  const cue=plan.cue,desired=Math.atan2(-(cue[0]-p.x),-(cue[2]-p.z)),angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
  motor.command(Math.abs(angle)>.05?(angle>0?1:2):0,{kind:'expedition',safe_walk:true,strict_ground:true,auto_step:true,navigation_lock:true,center_route:!!cue.centering,waypoints:[cue],safety_focus:cue,route_corridor:plan.corridor},{...proximity(b),focusPoint:cue,cueDistance:Math.hypot(cue[0]-p.x,cue[2]-p.z)},angle);
  samples++;await wait(200);
 }
 throw Error('Terrace movement timed out: '+JSON.stringify({position:b.entity.position.toArray(),navigation:nav.status,motor:motor.diagnostic()}));
}
(async()=>{try{
 await once(b,'spawn');await wait(1200);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1559,y:217,z:-1559});await wait(1600);
 for(let x=-1568;x<=-1550;x++)for(let z=-1568;z<=-1550;z++)for(let y=207;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture starts empty');
 changed=true;await commands(['fill -1568 209 -1568 -1550 209 -1550 stone','fill -1568 210 -1568 -1560 210 -1550 stone','tp @s -1561.5 211 -1558.5 -90 0']);
 await admin({action:'gamemode',gamemode:'survival'});await b.waitForTicks(8);
 motor=createMotor(b,{move:true,jump:true,turn:true});physics=()=>motor.tick();b.on('physicsTick',physics);
 report.descent=await follow(new WorldNavigation(),[-1554.5,210.1,-1558.5]);assert.equal(report.descent.descended,true);
 motor.pause();await commands(['tp @s -1558.15 210 -1558.5 -90 0']);await b.waitForTicks(8);
 const nav=new WorldNavigation(),goal=[-1554.5,210.1,-1554.5],landing=[-1558.5,210.1,-1558.5];landing.centering=true;
 Object.assign(nav,{destination:goal.join(','),path:[landing,[-1558.5,210.1,-1557.5],goal],anchor:[-1559.5,211.1,-1558.5],lastPlan:Date.now(),progressAt:Date.now(),lastPosition:[-1558.3,210.5,-1558.5]});
 report.late_corner=await follow(nav,goal,landing);
 motor.pause();await commands(['fill -1561 211 -1560 -1561 211 -1558 stone','fill -1562 211 -1560 -1562 212 -1558 stone','fill -1563 211 -1560 -1563 213 -1558 stone','tp @s -1558.69 210 -1558.5 90 0']);await b.waitForTicks(8);
 const mine=require('../controller/staircase_mining'),walker=new WorldNavigation(),state={world:{bounds:[-1568,-1550,-1568,-1550]}},m={stage:'exit',resource:'stone',entry:[-1563,214,-1559],path:[[-1563,214,-1559],[-1562,213,-1559],[-1561,212,-1559],[-1560,211,-1559],[-1559,210,-1559]],exitIndex:3};
 const t={plot:{x:-1530,y:211,z:-1530},wilderness:{mine:m},campPlots:[],walk:async(_b,_motor,g)=>{
  const p=b.entity.position,plan=walker.plan(b,g,{bounds:state.world.bounds});if(plan.arrived)return true;assert.ok(!plan.blocked);
  const q=plan.cue,desired=Math.atan2(-(q[0]-p.x),-(q[2]-p.z)),angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
  motor.command(Math.abs(angle)>.08?(angle>0?1:2):3,{kind:'expedition',auto_step:true,safe_walk:true,strict_ground:true,navigation_lock:true,waypoints:[q],safety_focus:q,route_corridor:plan.corridor},{...proximity(b),focusPoint:q},angle);
 }};
 const start=Date.now();let heldFrames=0;
 while(m.stage!=='done'&&Date.now()-start<20000){await mine.tick(t,b,motor,state);if(b.entity.onGround===false&&motor.committedJump()){assert.equal(b.getControlState('forward'),true,'airborne mine return holds forward');heldFrames++;}await wait(100);}
 assert.equal(m.stage,'done');assert.ok(heldFrames>=4);assert.ok(b.entity.position.y>=214);report.mine_exit={steps:4,held_forward_airborne_frames:heldFrames,seconds:(Date.now()-start)/1000};
 assert.equal(b.health,20);report.health=b.health;report.passed=true;
 }catch(error){report.error=error.stack;process.exitCode=1;}finally{
 motor?.pause();if(physics)b.removeListener('physicsTick',physics);b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'});
 if(changed){await commands(['fill -1568 207 -1568 -1550 216 -1550 air','kill @e[type=item,x=-1568,y=207,z=-1568,dx=18,dy=9,dz=18]','clear @s']);for(let x=-1568;x<=-1550;x++)for(let z=-1568;z<=-1550;z++)for(let y=207;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}
 await admin({action:'deop'});report.cleaned=true;b.quit();fs.writeFileSync('logs/downhill-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }})().then(()=>setTimeout(()=>process.exit(process.exitCode||0),200)).catch(e=>{console.error(e);b.quit();process.exit(1);});

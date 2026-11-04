const fs=require('fs'),assert=require('assert/strict'),m=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3'),{WorldNavigation}=require('../controller/world_navigation'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=m.createBot({host:'127.0.0.1',port:25565,username:'LabWaterTest',auth:'offline',version:'1.21.4'});let changed=false,motor;const result={diagnostic_only:true};b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<25;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();if(i===24)throw Error(await r.text());await wait(400);}}
async function commands(list){await admin({action:'op'});await wait(800);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(400);}}
(async()=>{try{
await once(b,'spawn');await wait(1800);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1606.5,y:220,z:-1600.5});await wait(2000);
for(let x=-1610;x<=-1590;x++)for(let z=-1604;z<=-1596;z++)for(let y=206;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');
changed=true;await commands(['fill -1610 207 -1604 -1590 210 -1596 stone','fill -1602 208 -1603 -1598 210 -1597 water','fill -1610 215 -1604 -1590 215 -1596 sea_lantern','tp @s -1606.5 211 -1600.5']);await admin({action:'gamemode',gamemode:'survival'});await wait(300);
result.crossings=[];
for(const shallow of (process.argv.includes('--recovery-only')?[]:[false,true])){
 if(shallow){
  await admin({action:'gamemode',gamemode:'creative'});
  await commands(['fill -1602 208 -1603 -1598 210 -1597 stone','fill -1602 210 -1603 -1598 210 -1597 air','setblock -1602 210 -1600 water','tp @s -1601.5 210.2 -1600.5']);
  await wait(1500);await admin({action:'gamemode',gamemode:'survival'});
 }
 const nav=new WorldNavigation(),goal=[-1593.5,211.1,-1600.5],bounds=[-1611,-1589,-1603,-1597],started=Date.now();motor=createMotor(b,{move:true,jump:true,turn:true});let arrived=false,wet=false,waterRouteSeen=false,runoffSeen=false;const health=b.health;
 while(Date.now()-started<45000){
  for(let x=-1602;x<=-1598;x++){const v=b.blockAt(new Vec3(x,210,-1600));if(v?.name==='water'&&Number(v.getProperties().level)>0)runoffSeen=true;}
  const plan=nav.plan(b,goal,{bounds});if(plan.arrived){arrived=true;break;}assert.equal(plan.blocked,false);waterRouteSeen||=!!plan.water_route;wet||=!!b.entity.isInWater;motor.command(shallow?5:0,{water_route:true,waypoints:[plan.cue]},null,0);await wait(100);
 }
 result.navigation=nav.status;result.remaining=nav.path.slice(0,3);result.in_water=b.entity.isInWater;result.on_ground=b.entity.onGround;
 assert.equal(arrived,true,'crossed the channel and reached dry bank');assert.equal(wet,true,'actually entered water');assert.equal(waterRouteSeen,true);assert.ok(b.health>=health,'no health lost');if(shallow)assert.equal(runoffSeen,true,'shallow flowing water was present');
 result.crossings.push({shallow,seconds:(Date.now()-started)/1000,health:b.health,swam:wet,runoff_seen:runoffSeen,position:b.entity.position.toArray()});motor.pause();motor=null;
}
// An accidental submerged entry has no pre-existing surface route. Then replay
// the stationary-swimmer condition with its physical progress clock expired.
result.recovery=[];
for(const submerged of [true,false,'stale-land-route']){
 await admin({action:'gamemode',gamemode:'creative'});await commands(['fill -1602 208 -1603 -1598 210 -1597 water',`tp @s -1600.5 ${submerged===true?209.2:210.2} -1600.5`]);await admin({action:'gamemode',gamemode:'survival'});await wait(400);
 const nav=new WorldNavigation(),goal=[-1593.5,211.1,-1600.5],bounds=[-1611,-1589,-1603,-1597],began=Date.now(),startingHealth=b.health;motor=createMotor(b,{move:true,jump:true,turn:true});
 if(!submerged){nav.swimRecovery={anchor:b.entity.position.clone(),progressAt:Date.now()-4000};b.setControlState('forward',true);}
 if(submerged==='stale-land-route')Object.assign(nav,{destination:goal.join(','),path:[[-1596.5,211.1,-1600.5],goal],anchor:b.entity.position.toArray(),lastPlan:Date.now()-4000,progressAt:Date.now()-4000,waterRoute:false});
 let landed=false,escapeSeen=false,surfacingSeen=false,replannedWater=false;
 while(Date.now()-began<20000){
  const p=b.entity.position,plan=nav.plan(b,goal,{bounds}),cell=require('../controller/water_navigation').cell(b,Math.floor(p.x),Math.round(p.y),Math.floor(p.z));
  escapeSeen ||= !!nav.status.water_recovery;replannedWater ||= nav.replanned&&!!plan.water_route;
  if(cell&&!cell.wet&&b.entity.onGround){landed=true;nav.plan(b,goal,{bounds});assert.deepEqual(nav.status.target,goal,'original task resumes after shore');break;}
  if(plan.blocked){surfacingSeen=true;motor.command(4,{water_route:true,waypoints:[[p.x,p.y,p.z]]},{},0);}
  else motor.command(0,{water_route:true,waypoints:[plan.cue]},{},0);
  await wait(100);
 }
 assert.equal(landed,true);if(submerged===true)assert.equal(surfacingSeen,true);else if(submerged===false)assert.equal(escapeSeen,true);else assert.equal(replannedWater,true,'stale dry landing replaced by a swimming route');assert.ok(b.health>=startingHealth);
 result.recovery.push({submerged,replanned_water:replannedWater,escape_seen:escapeSeen,surfacing_seen:surfacingSeen,seconds:(Date.now()-began)/1000,health:b.health,position:b.entity.position.toArray()});motor.pause();motor=null;
}
// A solid overhang blocks vertical buoyancy; escape sideways before rising.
await admin({action:'gamemode',gamemode:'creative'});await commands(['fill -1600 211 -1601 -1599 211 -1600 grass_block','tp @s -1599.5 209.2 -1600.5']);await admin({action:'gamemode',gamemode:'survival'});await wait(300);
const air=require('../controller/air_escape'),airTeacher={phase:'gather',campPlots:[]},airStart=b.entity.position.clone(),airHealth=b.health,airAt=Date.now();motor=createMotor(b,{move:true,jump:true,turn:true});let breathing=false;
while(Date.now()-airAt<10000){if(!air.tick(airTeacher,b,motor,{world:{bounds:[-1611,-1589,-1603,-1597]}})){breathing=true;break;}await wait(100);}
assert.equal(breathing,true);assert.ok(Math.hypot(b.entity.position.x-airStart.x,b.entity.position.z-airStart.z)>.4);assert.ok(b.health>=airHealth);assert.equal(airTeacher.phase,'gather');motor.pause();motor=null;
result.overhang_escape={seconds:(Date.now()-airAt)/1000,health:b.health,position:b.entity.position.toArray()};result.passed=true;
}catch(error){result.error=error.stack;result.position=b.entity.position.toArray();process.exitCode=1;}finally{motor?.pause();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});if(changed){await commands(['fill -1610 206 -1604 -1590 216 -1596 air']);for(let x=-1610;x<=-1590;x++)for(let z=-1604;z<=-1596;z++)for(let y=206;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await admin({action:'gamemode',gamemode:'survival'});await admin({action:'deop'});result.cleaned=true;b.quit();fs.writeFileSync('logs/water-crossing-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(process.exitCode||0),300);}})().catch(e=>{console.error(e);b.quit();process.exit(1);});

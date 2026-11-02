const fs=require('fs'),assert=require('assert/strict'),m=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3'),{WorldNavigation}=require('../controller/world_navigation'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=m.createBot({host:'127.0.0.1',port:25565,username:'LabWaterTest',auth:'offline',version:'1.21.4'});let changed=false,motor;const result={diagnostic_only:true};b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<25;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();if(i===24)throw Error(await r.text());await wait(400);}}
async function commands(list){await admin({action:'op'});await wait(800);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(400);}}
(async()=>{try{
await once(b,'spawn');await wait(1800);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1606.5,y:220,z:-1600.5});await wait(2000);
for(let x=-1610;x<=-1590;x++)for(let z=-1604;z<=-1596;z++)for(let y=206;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');
changed=true;await commands(['fill -1610 207 -1604 -1590 210 -1596 stone','fill -1602 208 -1603 -1598 210 -1597 water','fill -1610 215 -1604 -1590 215 -1596 sea_lantern','tp @s -1606.5 211 -1600.5']);await admin({action:'gamemode',gamemode:'survival'});await wait(300);
result.crossings=[];
for(const shallow of [false,true]){
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
result.passed=true;
}catch(error){result.error=error.stack;result.position=b.entity.position.toArray();process.exitCode=1;}finally{motor?.pause();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});if(changed){await commands(['fill -1610 206 -1604 -1590 216 -1596 air']);for(let x=-1610;x<=-1590;x++)for(let z=-1604;z<=-1596;z++)for(let y=206;y<=216;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await admin({action:'gamemode',gamemode:'survival'});await admin({action:'deop'});result.cleaned=true;b.quit();fs.writeFileSync('logs/water-crossing-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(process.exitCode||0),300);}})().catch(e=>{console.error(e);b.quit();process.exit(1);});

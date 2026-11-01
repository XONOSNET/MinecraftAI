// Empty-inventory refuge under a real skeleton: real digging, capping and pillar exit.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events');
const burrow=require('../controller/emergency_burrow'),inventory=require('../controller/inventory_sync'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),feet=new Vec3(-1300,211,-1300),result={};let changed=false,motor,t;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBurrowTest',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1300,y:220,z:-1300});await wait(2000);
 for(let x=-1315;x<=-1285;x++)for(let z=-1315;z<=-1285;z++)for(let y=205;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture volume must be empty');
 changed=true;await commands(['fill -1315 206 -1315 -1285 210 -1285 dirt','fill -1315 216 -1315 -1285 216 -1285 stone','clear @s','tp @s -1299.5 211 -1299.5','summon skeleton -1287.5 211 -1299.5 {PersistenceRequired:1b,Tags:["lab_burrow_fixture"]}']);
 await admin({action:'gamemode',gamemode:'survival'});await wait(400);await inventory.sync(b);assert.equal(b.inventory.items().length,0,'no starting items');
 motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});t={phase:'night_burrow',plot:{x:-1270,y:211,z:-1270},campPlots:[],milestones:[],wilderness:{burrow:{feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(1,0,0).toArray(),stage:'approach',resume:'gather',reason:'Native refuge test',progressAt:Date.now()}},navigator:{lastPlan:0},walk:async()=>true};
 const state={run:'native-burrow-only',world:{bounds:[-1308,-1292,-1308,-1292],first_night:{hostiles:true}}},started=Date.now();
 result.started_at=Date.now();result.stages=[];while(t.wilderness.burrow?.stage!=='hidden'&&Date.now()-started<25000){await burrow.tick(t,b,motor,state);const stage=t.wilderness.burrow?.stage;if(result.stages.at(-1)?.stage!==stage)result.stages.push({stage,seconds:(Date.now()-result.started_at)/1000});await wait(80);}
 assert.equal(t.wilderness.burrow?.stage,'hidden','real shaft sealed');assert.equal(b.entity.position.y,209);assert.equal(burrow.sealed(b,t.wilderness.burrow),true);result.sealed_seconds=(Date.now()-started)/1000;result.hidden_health=b.health;
 await wait(3000);assert.equal(b.health,result.hidden_health,'sealed roof protects the occupant');assert.ok(b.health>0);
 await commands(['kill @e[tag=lab_burrow_fixture]']);await wait(1200);
 // Only the diagnostic sensor is given daylight; global server time is untouched.
 const original=b.time.timeOfDay;b.time.timeOfDay=6000;try{await burrow.tick(t,b,motor,state);}finally{b.time.timeOfDay=original;}
 assert.equal(t.wilderness.burrow.stage,'open');const exitAt=Date.now();
 while(t.wilderness.burrow&&Date.now()-exitAt<25000){await burrow.tick(t,b,motor,state);await wait(80);}
 assert.equal(t.wilderness.burrow,null,'two real jump placements returned to surface');assert.equal(t.phase,'gather');assert.ok(b.entity.position.y>=211);assert.equal(b.game.gameMode,'survival');assert.deepEqual(t.milestones,[]);
 result.exit_seconds=(Date.now()-exitAt)/1000;result.health=b.health;result.position=b.entity.position.clone();result.no_starting_items=true;result.local_daylight_sensor_only=true;result.passed=true;
}catch(error){result.error=error.stack;result.burrow=t?.wilderness.burrow;result.position=b.entity.position.clone();result.enemies=Object.values(b.entities).filter(e=>e.name==='skeleton').map(e=>({position:e.position.clone(),valid:e.isValid}));result.cap=b.blockAt(new Vec3(...t.wilderness.burrow.cap))?.name;result.items=b.inventory.items().map(i=>({name:i.name,count:i.count}));throw error;}finally{
 motor?.pause();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed){await commands(['kill @e[tag=lab_burrow_fixture]','kill @e[type=item,x=-1315,y=205,z=-1315,dx=30,dy=12,dz=30]','kill @e[type=experience_orb,x=-1315,y=205,z=-1315,dx=30,dy=12,dz=30]','fill -1315 205 -1315 -1285 217 -1285 air']);for(let x=-1315;x<=-1285;x++)for(let z=-1315;z<=-1285;z++)for(let y=205;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture cleanup verified');}
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});result.cleaned=true;b.quit();fs.writeFileSync('logs/emergency-burrow-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{motor?.pause();b.quit();process.exitCode=1;},120000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});

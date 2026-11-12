// Empty-inventory refuge under a real skeleton: real digging, capping and pillar exit.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events');
const burrow=require('../controller/emergency_burrow'),inventory=require('../controller/inventory_sync'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),feet=new Vec3(-1300,211,-1300),grassOnly=process.argv.includes('--grass-cover'),result={mobile_archer:!grassOnly};let changed=false,motor,t;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBurrowTest',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1300,y:220,z:-1300});await wait(2000);
 if(process.argv.includes('--clean-only')){changed=true;result.cleanup_only=true;return;}
 for(let x=-1315;x<=-1285;x++)for(let z=-1315;z<=-1285;z++)for(let y=205;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture volume must be empty');
 changed=true;await commands(['fill -1315 206 -1315 -1285 210 -1285 dirt','fill -1315 216 -1315 -1285 216 -1285 sea_lantern','kill @e[type=!player,type=!item,type=!experience_orb,x=-1315,y=211,z=-1315,dx=30,dy=6,dz=30]','clear @s','tp @s -1299.5 211 -1299.5',...(!grassOnly?['summon skeleton -1287.5 211 -1299.5 {PersistenceRequired:1b,Tags:["lab_burrow_fixture"]}']:[])]);
 await admin({action:'gamemode',gamemode:'survival'});await wait(400);await inventory.sync(b);assert.equal(b.inventory.items().length,0,'no starting items');
 motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});t={phase:'night_burrow',plot:{x:-1270,y:211,z:-1270},campPlots:[],milestones:[],wilderness:{burrow:{feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(1,0,0).toArray(),stage:'approach',resume:'gather',reason:'Native refuge test',progressAt:Date.now()}},navigator:{lastPlan:0},walk:async()=>true};
 const state={run:'native-burrow-only',world:{bounds:[-1308,-1292,-1308,-1292],first_night:{hostiles:true}}},started=Date.now();
 result.started_at=Date.now();result.stages=[];while(t.wilderness.burrow?.stage!=='hidden'&&Date.now()-started<25000){
  if(process.argv.includes('--blocked-opening')&&t.wilderness.burrow?.stage==='seal'&&!result.opening_blocker_spawned){
   await commands(['summon zombie -1299.5 211 -1299.5 {NoAI:1b,NoGravity:1b,Health:2f,PersistenceRequired:1b,Tags:["lab_burrow_fixture"]}']);result.opening_blocker_spawned=true;
  }
  await burrow.tick(t,b,motor,state);if(t.wilderness.burrow?.lastOpeningAttack)result.opening_attacked=true;
  const stage=t.wilderness.burrow?.stage;if(result.stages.at(-1)?.stage!==stage)result.stages.push({stage,seconds:(Date.now()-result.started_at)/1000});await wait(80);
 }
 if(process.argv.includes('--blocked-opening'))assert.equal(result.opening_attacked,true,'native hostile at the roof was attacked before sealing');
 assert.equal(t.wilderness.burrow?.stage,'hidden','real shaft sealed');assert.equal(b.entity.position.y,209);assert.equal(burrow.sealed(b,t.wilderness.burrow),true);result.sealed_seconds=(Date.now()-started)/1000;result.hidden_health=b.health;
 await wait(3000);assert.ok(b.health>=result.hidden_health,'sealed roof prevents further damage; normal regeneration is allowed');assert.ok(b.health>0);
 if(process.argv.includes('--protected-work')){
  await commands(['give @s torch 2']);
  const original=b.time.timeOfDay,workStarted=Date.now();
  try{
   while(!t.wilderness.burrow.workspace?.lit&&Date.now()-workStarted<16000){
    b.time.timeOfDay=14000;await burrow.tick(t,b,motor,state);await wait(100);
   }
  }finally{b.time.timeOfDay=original;}
  const s=t.wilderness.burrow;
  assert.equal(s.workspace?.lit,true,'a native torch lights the capped alcove');
  assert.equal(burrow.walls(b,feet,s),true);assert.equal(burrow.sealed(b,s),true);
  result.protectedWorkspace=s.workspace;
 }
 // Deterministic damage only inside this isolated empty-inventory survival fixture.
 if(process.argv.includes('--shell-breach')||process.argv.includes('--roof-breach')){
  const roof=process.argv.includes('--roof-breach'),gap=roof?feet:feet.offset(-1,-1,0);
  await commands(['kill @e[tag=lab_burrow_fixture]',`setblock ${gap.x} ${gap.y} ${gap.z} air`]);
  const repairAt=Date.now();
  while((t.wilderness.burrow.shellRepairs||0)<1&&Date.now()-repairAt<18000){await burrow.tick(t,b,motor,state);await wait(80);}
  assert.equal(t.wilderness.burrow.shellRepairs,1,'real dirt repaired the damaged shell');
  assert.equal(b.blockAt(gap)?.name,'dirt');assert.equal(burrow.walls(b,feet,t.wilderness.burrow),true);assert.equal(burrow.sealed(b,t.wilderness.burrow),true);
  result.repair={roof,seconds:(Date.now()-repairAt)/1000,closed_pocket:!!t.wilderness.burrow.repairNotch,report:burrow.report(t)};
 }
 // Simulate ordinary grass spreading onto both fixture soil covers.
 await commands(['setblock -1300 211 -1300 grass_block','setblock -1299 211 -1300 grass_block','kill @e[tag=lab_burrow_fixture]']);await wait(1200);
 assert.equal(burrow.sealed(b,t.wilderness.burrow),true);result.grass_cover_verified=true;
 // Only the diagnostic sensor is given daylight; global server time is untouched.
 const original=b.time.timeOfDay;let exitAt;const missingLip=process.argv.includes('--missing-lip-drop');
 try{b.time.timeOfDay=6000;await burrow.tick(t,b,motor,state);
 assert.equal(t.wilderness.burrow.stage,'open');exitAt=Date.now();
 while(t.wilderness.burrow&&Date.now()-exitAt<25000){
  if(grassOnly&&t.wilderness.burrow.stage==='climb'&&b.entity.position.y>=210&&!result.carried_light_verified){
   await commands(['setblock -1300 211 -1300 light[level=14]']);assert.equal(b.blockAt(feet)?.name,'light');result.carried_light_verified=true;
  }
  const before=t.wilderness.burrow.stage;
  b.time.timeOfDay=6000;await burrow.tick(t,b,motor,state);await wait(80);
  if(missingLip&&before==='reclaim'){
   // Remove loose fixture drops first; a tossed block can otherwise be picked
   // back up while temporary operator commands are waiting for acknowledgement.
   await commands(['kill @e[type=item,x=-1315,y=205,z=-1315,dx=30,dy=12,dz=30]']);await inventory.sync(b);
   if(b.inventory.items().filter(i=>i.name==='dirt').reduce((n,i)=>n+i.count,0)===2){await commands(['clear @s dirt 1']);await inventory.sync(b);}
   assert.equal(b.inventory.items().filter(i=>i.name==='dirt').reduce((n,i)=>n+i.count,0),1,'only roof recovered; lip unavailable');result.missing_lip_verified=true;
  }
  if(t.wilderness.burrow?.exitNotch)result.safe_exit_pocket_verified=true;
 }
 }finally{b.time.timeOfDay=original;}
 assert.equal(t.wilderness.burrow,null,'two real jump placements returned to surface');assert.equal(t.phase,'gather');assert.ok(b.entity.position.y>=211);assert.equal(b.game.gameMode,'survival');assert.deepEqual(t.milestones,[]);
 result.exit_seconds=(Date.now()-exitAt)/1000;result.health=b.health;result.position=b.entity.position.clone();result.no_starting_items=true;result.local_daylight_sensor_only=true;result.passed=true;
}catch(error){result.error=error.stack;result.burrow=t?.wilderness.burrow;result.position=b.entity.position.clone();result.enemies=Object.values(b.entities).filter(e=>e.name==='skeleton').map(e=>({position:e.position.clone(),valid:e.isValid}));result.cap=t?.wilderness.burrow?b.blockAt(new Vec3(...t.wilderness.burrow.cap))?.name:null;result.items=b.inventory.items().map(i=>({name:i.name,count:i.count}));fs.writeFileSync("logs/emergency-burrow-native-before-cleanup.json",JSON.stringify(result,null,2));throw error;}finally{
 motor?.pause();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed){await admin({action:"teleport-coordinates",x:-1300,y:220,z:-1300});await wait(1500);await b.waitForChunksToLoad();await commands(['clear @s','kill @e[tag=lab_burrow_fixture]','kill @e[type=item,x=-1315,y=205,z=-1315,dx=30,dy=12,dz=30]','kill @e[type=experience_orb,x=-1315,y=205,z=-1315,dx=30,dy=12,dz=30]','fill -1315 205 -1315 -1285 217 -1285 air']);for(let x=-1315;x<=-1285;x++)for(let z=-1315;z<=-1285;z++)for(let y=205;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture cleanup verified');}
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});result.cleaned=true;b.quit();fs.writeFileSync('logs/emergency-burrow-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{motor?.pause();b.quit();process.exitCode=1;},120000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});

// Isolated real-server mechanics test. Fixture grants are explicit; no replay/model writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),night=require('../controller/first_night'),{HutTeacher,blueprint,surface}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks'),inventory=require('../controller/inventory_sync'),{WorldNavigation}=require('../controller/world_navigation');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-248,y:180,z:-124},bounds=[-274,-218,-150,-94],tag='lab_first_night_fixture';
const ledgeCorner=process.argv.includes('--ledge-center-only'),corner=process.argv.includes('--corner-only')||process.argv.includes('--pickup-corner-only')||ledgeCorner,pickupCorner=process.argv.includes('--pickup-corner-only');
const result={fixture:'Isolated First Night mechanics using teacher decisions; not an autonomous wilderness qualification.',grants:['Completed illuminated shelter, chest and furnace','Four logs for early axe crafting','Wooden pickaxe for exposed-stone test','Four fixture cows, three sheep and furnace fuel'],checks:[]};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabNightCheck',version:'1.21.4'});inventory.attach(b);
const post=async d=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok){const e=await r.text();if(e.includes('not online')&&(d._retry||0)<8){await wait(500);return post({...d,_retry:(d._retry||0)+1});}throw Error(e);}return r.json();};
async function commands(rows){await post({action:'op',player:b.username});await wait(600);for(const c of rows){b.chat('/'+c);await wait(110);}await wait(800);}
async function teleport(position){await post({action:'teleport-coordinates',player:b.username,...position});const deadline=Date.now()+10000;while(b.entity.position.distanceTo(new Vec3(position.x,position.y,position.z))>.35){if(Date.now()>deadline)throw Error('Fixture teleport was not applied');await wait(100);}await wait(300);}
let changed=false,motor,finished=false;
async function finish(){if(finished)return;finished=true;motor?.pause();if(changed)await commands([`kill @e[tag=${tag}]`,`kill @e[type=item,x=-274,y=178,z=-150,dx=56,dy=12,dz=56]`,'kill @e[tag=lab_natural_fauna,x=-274,y=-64,z=-150,dx=56,dy=383,dz=56]','fill -274 179 -150 -218 187 -94 air']).catch(e=>{result.cleanup_error=e.message;});await post({action:'deop',player:b.username}).catch(()=>{});if(!process.argv.includes('--cleanup-only'))fs.writeFileSync(ledgeCorner?'docs/first-night-ledge-center-native.json':pickupCorner?'docs/first-night-pickup-corner-native.json':corner?'docs/first-night-corner-native.json':process.argv.includes('--camp-only')?'docs/first-night-camp-route-native.json':process.argv.includes('--inventory-only')?'docs/first-night-inventory-native.json':process.argv.includes('--fauna-only')?'docs/first-night-fauna-native.json':process.argv.includes('--regressions-only')?'docs/first-night-regressions-native.json':'docs/first-night-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{
 try{
  await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'spectator'});await teleport({x:plot.x,y:185,z:plot.z});await wait(2000);
  if(process.argv.includes('--cleanup-only')){changed=true;result.success=true;return;}
  for(let x=-274;x<=-218;x++)for(let z=-150;z<=-94;z++)for(let y=179;y<=187;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Native fixture volume is occupied at '+[x,y,z]);
  changed=true;const setup=['fill -274 179 -150 -218 179 -94 sea_lantern',...blueprint(plot).map(q=>`setblock ${q.x} ${q.y} ${q.z} ${q.table?'crafting_table':'oak_planks'}`),`setblock ${plot.x} 180 ${plot.z-3} oak_door[facing=north,half=lower]`,`setblock ${plot.x} 181 ${plot.z-3} oak_door[facing=north,half=upper]`,`setblock ${plot.x+2} 180 ${plot.z+2} chest`,`setblock ${plot.x-2} 180 ${plot.z+2} furnace`,
   `fill ${plot.x+7} 180 ${plot.z+2} ${plot.x+14} 181 ${plot.z+2} stone`,'clear @s','give @s oak_log 4','give @s wooden_pickaxe','gamemode survival @s',`tp @s ${plot.x+.5} 180 ${plot.z+.5}`,'effect give @s saturation 1 5 true','effect give @s instant_health 1 5 true'];
  for(let i=0;i<4;i++)setup.push(`summon cow ${plot.x+8+i} 180 ${plot.z-8} {Tags:["${tag}"],PersistenceRequired:1b,NoAI:1b}`);
  for(let i=0;i<3;i++)setup.push(`summon sheep ${plot.x+8+i} 180 ${plot.z-11} {Tags:["${tag}"],PersistenceRequired:1b,NoAI:1b,Color:0b}`);
  await commands(setup);await wait(700);
  if(process.argv.includes('--inventory-only')){
   result.fixture='Real-server inventory regression: forty log conversions must merge stacks and leave room to craft a door.';
   result.grants=['Isolated completed house and workbench','Forty oak logs'];
   await commands(['clear @s','give @s oak_log 40']);
   const {craft}=require('../controller/crafting');await craft(b,'oak_planks',40);await inventory.sync(b);
   const stacks=b.inventory.items().filter(i=>i.name==='oak_planks');result.planks=stacks.reduce((s,i)=>s+i.count,0);result.plank_stacks=stacks.length;
   await craft(b,'oak_door',1,b.blockAt(require('../controller/house').point(plot,'table')));await inventory.sync(b);
   result.doors=b.inventory.items().filter(i=>i.name==='oak_door').reduce((s,i)=>s+i.count,0);
   result.success=result.planks===160&&result.plank_stacks===3&&result.doors===3;return;
  }
  if(process.argv.includes('--fauna-only')){
   const before=Object.values(b.entities).filter(e=>['cow','sheep'].includes(e.name)&&e.position.x>bounds[0]&&e.position.x<bounds[1]&&e.position.z>bounds[2]&&e.position.z<bounds[3]);
   const uuids=new Set(before.map(e=>e.uuid));const {execFileSync}=require('child_process');
   const generate=snapshot=>JSON.parse(execFileSync('.venv/Scripts/python.exe',['-c',`import json;from lab.world_fauna import fauna_commands;print(json.dumps(fauna_commands([-274,-218,-150,-94],'native_verify',${snapshot?'True':'False'})))`],{encoding:'utf8',windowsHide:true}));
   await commands(generate(true));await commands(generate(false));await wait(1000);
   const animals=Object.values(b.entities).filter(e=>e.isValid!==false&&['cow','sheep'].includes(e.name)&&e.position.x>bounds[0]&&e.position.x<bounds[1]&&e.position.z>bounds[2]&&e.position.z<bounds[3]);
   result.fixture='Native passive-animal snapshot/reset; fresh UUIDs, restored species and white wool, no production worlds changed.';
   result.counts={before:before.length,after:animals.length,cows:animals.filter(e=>e.name==='cow').length,sheep:animals.filter(e=>e.name==='sheep').length};
   result.fresh_uuids=animals.every(e=>!uuids.has(e.uuid));const woolKey=b.registry.entitiesByName.sheep.metadataKeys.indexOf('wool');result.white_sheep=animals.filter(e=>e.name==='sheep').every(e=>(e.metadata[woolKey]&15)===0);
   result.success=result.counts.cows===4&&result.counts.sheep===3&&result.fresh_uuids&&result.white_sheep;return;
  }
  if(process.argv.includes('--regressions-only'))await commands([`setblock ${plot.x-3} ${plot.y} ${plot.z+1} air`]);
  const t=new HutTeacher();Object.assign(t,{run:'night-native',phase:'night_bootstrap',plot,table:require('../controller/house').point(plot,'table'),started:Date.now(),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),milestones:['hut'],resources:[],path:[],lastProgress:Date.now()});
  const state={run:'night-native',world:{mission:'first_night',first_night:{id:1,stations:false,trees:false,hold_seconds:2,hostiles:false},bounds,driver:'teacher',index:0}};night.init(t,state.world);
  motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
  const api=async(path,d)=>{if(path==='/step')return {action:d.teacher};if(path==='/world/survival'&&d.action==='home'){const foot=new Vec3(...d.position);if(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(foot.offset(0,0,1))?.name!=='white_bed')throw Error('Home lacks real bed');await commands([`spawnpoint @s ${d.position.join(' ')}`]);return {position:d.position,owner:b.username};}throw Error('Unexpected production endpoint '+path);};
  if(process.argv.includes('--camp-only')||corner){
   result.fixture='Real-server shared-house route: leave a neighboring closed room through its door, then enter the owned closed house.';
   const other={...plot,x:plot.x+10};
   if(!corner)await commands([...blueprint(other).map(q=>`setblock ${q.x} ${q.y} ${q.z} ${q.table?'crafting_table':'oak_planks'}`),`setblock ${other.x} ${other.y} ${other.z-3} oak_door[facing=north,half=lower]`,`setblock ${other.x} ${other.y+1} ${other.z-3} oak_door[facing=north,half=upper]`]);
   if(pickupCorner)await commands([`fill ${plot.x+2} ${plot.y} ${plot.z+13} ${plot.x+2} ${plot.y+3} ${plot.z+13} oak_log`]);
   if(ledgeCorner)await commands([`fill ${plot.x+9} ${plot.y} ${plot.z+12} ${plot.x+9} ${plot.y+2} ${plot.z+12} stone`]);
   t.campPlots=[plot,other];t.phase=pickupCorner?'night_food':'stone_return';
   await teleport({x:ledgeCorner?plot.x+10.7:pickupCorner?plot.x+3.726:corner?plot.x+3.065:other.x+.5,y:other.y,z:ledgeCorner?plot.z+12.5:pickupCorner?plot.z+14.641:corner?plot.z-3.471:other.z+.5});await wait(600);if(corner)await b.look(ledgeCorner?Math.PI/2:-1.471,0,true);
   result.start_position=b.entity.position.clone();const started=Date.now();let arrived=false,leftNeighbor=false;const goal=ledgeCorner?[plot.x+10.5,plot.y+.1,plot.z+15.5]:pickupCorner?[plot.x+.2915,plot.y+.1,plot.z+17.9377]:[plot.x+.5,plot.y+.1,plot.z+.5];
   while(!arrived&&Date.now()-started<(corner?20000:60000)){arrived=await t.walk(b,motor,goal,state,api,scan,tasks)===true;if(b.entity.position.z<other.z-4)leftNeighbor=true;await wait(100);}
   motor.pause();result.arrived_home=arrived;result.left_neighbor_through_exit=leftNeighbor;result.seconds=Math.round((Date.now()-started)/100)/10;result.position=b.entity.position.clone();result.navigation=t.lastNavigation;if(ledgeCorner)result.fixture='Native precision alignment: stop before the wall beyond a clear short waypoint, then turn onto the next leg';else if(pickupCorner)result.fixture='Real-server reproduction of the stalled food-pickup route beside a log column';else if(corner)result.fixture='Real-server reproduction of the reported outside-house corner, starting off-center beside the front wall.';result.success=arrived&&(leftNeighbor||corner);return;
  }
  async function leg(phase,until,seconds){t.phase=phase;t.navigator=new WorldNavigation();const started=Date.now();while(t.phase!==until){if(Date.now()-started>seconds*1000)throw Error('Native phase timeout: '+t.phase+' '+t.message);t.wilderness.memory.observe(b);await night.tick(t,b,motor,state,api,scan,tasks,surface);if(Date.now()-(result.pulse||0)>5000){result.pulse=Date.now();console.log(JSON.stringify({phase:t.phase,position:b.entity.position,message:t.message,food:b.inventory.items().map(i=>[i.name,i.count])}));}await wait(100);}motor.pause();result.checks.push({phase,seconds:Math.round((Date.now()-started)/100)/10});}
  await leg('night_bootstrap','gather',30);if(!b.inventory.items().some(i=>i.name==='wooden_axe'))throw Error('Early axe was not crafted');
  if(process.argv.includes('--regressions-only')){
   result.fixture='Regression checks: real early workbench placement, the reported workbench-corner route, and cooking with short-burning stick fuel.';
   result.grants=['Isolated completed house except missing workbench','Four logs and wooden pickaxe','One raw beef and four sticks for fuel'];
   const table=require('../controller/house').point(plot,'table');result.early_workbench=b.blockAt(table)?.name==='crafting_table';
   await commands([...blueprint(plot).filter(q=>!q.floor&&!q.table).map(q=>`setblock ${q.x} ${q.y} ${q.z} air`),`setblock ${plot.x-2} ${plot.y} ${plot.z+2} air`]);
   await teleport({x:plot.x-1.8514,y:plot.y,z:plot.z+2.6204});await wait(500);t.phase='floor';t.navigator=new WorldNavigation();
   const target=[plot.x-1.5,plot.y+.1,plot.z-.5],start=Date.now();let arrived=false;
   while(!arrived&&Date.now()-start<20000){arrived=await t.walk(b,motor,target,state,api,scan,tasks)===true;if(Date.now()-(result.cornerPulse||0)>2000){result.cornerPulse=Date.now();console.log(JSON.stringify({corner:t.lastNavigation,motor:motor.status(),controls:b.controlState}));}await wait(100);}motor.pause();result.corner={arrived,seconds:Math.round((Date.now()-start)/100)/10,position:b.entity.position.clone()};if(!arrived)throw Error('Workbench corner still blocked');
   await commands([...blueprint(plot).filter(q=>!q.floor).map(q=>`setblock ${q.x} ${q.y} ${q.z} ${q.table?'crafting_table':'oak_planks'}`),`setblock ${plot.x} ${plot.y} ${plot.z-3} oak_door[facing=north,half=lower,open=true]`,`setblock ${plot.x} ${plot.y+1} ${plot.z-3} oak_door[facing=north,half=upper,open=true]`]);
   await teleport({x:plot.x+.4589,y:plot.y,z:plot.z-3.3});await wait(500);await b.look(5.916666,0,true);t.navigator=new WorldNavigation();t.phase='stone_return';const doorStart=Date.now();let entered=false;
   while(!entered&&Date.now()-doorStart<20000){entered=await t.walk(b,motor,[plot.x+.5,plot.y+.1,plot.z+.5],state,api,scan,tasks)===true;await wait(100);}motor.pause();result.door_return={arrived:entered,seconds:Math.round((Date.now()-doorStart)/100)/10};if(!entered)throw Error('Return through door remained blocked');
   await commands([`setblock ${plot.x-2} ${plot.y} ${plot.z+2} furnace`,'clear @s',`data merge block ${plot.x-2} ${plot.y} ${plot.z+2} {Items:[],lit_time_remaining:0s,lit_total_time:0s,cooking_time_spent:0s}`,'give @s beef 1','give @s stick 4']);
   await teleport({x:plot.x+.5,y:plot.y,z:plot.z+.5});await wait(500);
   await require('../controller/furnace').smelt(b,b.blockAt(require('../controller/house').point(plot,'furnace')),'beef','cooked_beef',name=>name==='stick');await inventory.sync(b);
   result.stick_fuel_cooked=b.inventory.items().some(i=>i.name==='cooked_beef');result.success=result.early_workbench&&result.corner.arrived&&result.door_return.arrived&&result.stick_fuel_cooked;result.health=b.health;return;
  }
  await leg('night_stone','night_fuel',120);if(b.inventory.items().filter(i=>i.name==='cobblestone').reduce((s,i)=>s+i.count,0)<16)throw Error('Natural stone drops not collected');
  await commands(['give @s stone_axe','give @s oak_planks 12']);
  // The round trip uses real observed positions, not production resource cues.
  t.wilderness.memory.remember('stone',[plot.x+12,180,plot.z+2]);
  await leg('night_food','night_scout',180);if(night.meals(b)<4)throw Error('Four meals not cooked');
  await leg('night_scout','night_hold',60);await leg('night_hold','complete',10);
  const saved=t.wilderness.memory.snapshot();result.memory={landmarks:saved.resources.length,road_nodes:saved.roads.length,road_edges:saved.edges.length};result.milestones=t.milestones;result.health=b.health;result.success=b.health===20&&t.milestones.includes('survived')&&t.milestones.includes('round_trip');
 }catch(e){result.error=e.stack;result.position=b.entity?.position;result.inventory=b.inventory?.items().map(i=>[i.name,i.count]);}
 finally{await finish();}
});
setTimeout(async()=>{result.error='Native fixture hard deadline';await finish();},420000).unref();

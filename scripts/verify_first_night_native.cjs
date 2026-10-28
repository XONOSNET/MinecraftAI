// Isolated real-server mechanics test. Fixture grants are explicit; no replay/model writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),night=require('../controller/first_night'),{HutTeacher,blueprint,surface}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks'),inventory=require('../controller/inventory_sync'),{WorldNavigation}=require('../controller/world_navigation');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-248,y:180,z:-124},bounds=[-274,-218,-150,-94],tag='lab_first_night_fixture';
const combatOnly=process.argv.includes('--combat-only');
const buildingOnly=process.argv.includes('--building-only');
const livestockOnly=process.argv.includes('--livestock-only'),slowRpc=process.argv.includes('--slow-rpc-only');
const unfinishedPlot=process.argv.includes('--unfinished-plot-only'),bootstrapStance=process.argv.includes('--bootstrap-stance-only');
const ledgeCorner=process.argv.includes('--ledge-center-only'),corner=process.argv.includes('--corner-only')||process.argv.includes('--pickup-corner-only')||ledgeCorner,pickupCorner=process.argv.includes('--pickup-corner-only');
const result={fixture:'Isolated First Night mechanics using teacher decisions; not an autonomous wilderness qualification.',grants:['Completed illuminated shelter, chest and furnace','Four logs for early axe crafting','Wooden pickaxe for exposed-stone test','Four fixture cows, three sheep and furnace fuel'],checks:[]};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabNightCheck',version:'1.21.4'});inventory.attach(b);
const post=async d=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok){const e=await r.text();if(e.includes('not online')&&(d._retry||0)<8){await wait(500);return post({...d,_retry:(d._retry||0)+1});}throw Error(e);}return r.json();};
async function commands(rows){await post({action:'op',player:b.username});await wait(600);for(const c of rows){b.chat('/'+c);await wait(110);}await wait(800);}
async function teleport(position){await post({action:'teleport-coordinates',player:b.username,...position});const deadline=Date.now()+10000;while(b.entity.position.distanceTo(new Vec3(position.x,position.y,position.z))>.35){if(Date.now()>deadline)throw Error('Fixture teleport was not applied');await wait(100);}await wait(300);}
let changed=false,motor,finished=false;
async function finish(){if(finished)return;finished=true;motor?.pause();if(changed)await commands([`kill @e[tag=${tag}]`,`kill @e[tag=lab_world_survival,x=-274,y=178,z=-150,dx=56,dy=12,dz=56]`,`kill @e[type=item,x=-274,y=178,z=-150,dx=56,dy=12,dz=56]`,'kill @e[tag=lab_natural_fauna,x=-274,y=-64,z=-150,dx=56,dy=383,dz=56]','fill -274 179 -150 -218 187 -94 air']).catch(e=>{result.cleanup_error=e.message;});await post({action:'deop',player:b.username}).catch(()=>{});if(!process.argv.includes('--cleanup-only'))fs.writeFileSync(combatOnly?'docs/combat-and-hunting-native.json':buildingOnly?'docs/first-night-building-native.json':livestockOnly?'docs/first-night-livestock-native.json':slowRpc?'docs/first-night-slow-rpc-native.json':unfinishedPlot?'docs/first-night-unfinished-plot-native.json':bootstrapStance?'docs/first-night-workbench-stance-native.json':ledgeCorner?'docs/first-night-ledge-center-native.json':pickupCorner?'docs/first-night-pickup-corner-native.json':corner?'docs/first-night-corner-native.json':process.argv.includes('--camp-only')?'docs/first-night-camp-route-native.json':process.argv.includes('--inventory-only')?'docs/first-night-inventory-native.json':process.argv.includes('--fauna-only')?'docs/first-night-fauna-native.json':process.argv.includes('--regressions-only')?'docs/first-night-regressions-native.json':'docs/first-night-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
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
  if(process.argv.includes('--regressions-only')||bootstrapStance)await commands([`setblock ${plot.x-3} ${plot.y} ${plot.z+1} air`]);
  const t=new HutTeacher();Object.assign(t,{run:'night-native',phase:'night_bootstrap',plot,table:require('../controller/house').point(plot,'table'),started:Date.now(),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),milestones:['hut'],resources:[],path:[],lastProgress:Date.now()});
  const state={run:'night-native',world:{mission:'first_night',first_night:{id:1,stations:false,trees:false,hold_seconds:2,hostiles:false},bounds,driver:'teacher',index:0}};night.init(t,state.world);
  motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
  const api=async(path,d)=>{if(path==='/step'){if(slowRpc)await wait(2200);return {action:d.teacher};}if(path==='/world/livestock'&&d.action==='release'&&livestockOnly){await commands([`execute as ${d.entity_uuid} run data merge entity @s {NoAI:0b}`]);return {released:true};}if(path==='/world/livestock'&&livestockOnly){result.refill_requests=(result.refill_requests||0)+1;if(result.refill_requests>1)throw Error('Unexpected second replacement request');const generated=JSON.parse(require('child_process').execFileSync('.venv/Scripts/python.exe',['-c',`import json;from pathlib import Path;from lab.world_training import WorldTraining;from lab.first_night import profile;c=[];now=[0];w=WorldTraining(Path('logs/unused-native-livestock.json'),c.append,Path('logs/unused-native-livestock.log'),lambda:now[0]);w.session=dict(active=True,phase='running',mission='first_night',first_night=profile(0),night_level=0,assessment=False,run='night-native',bots=['LabNightCheck'],bounds=[-274,-218,-150,-94],camp=dict(plots=[dict(x=-248,y=180,z=-124)]));d=dict(agent='LabNightCheck',run='night-native',resource='wool');w.livestock(d);now[0]=31;r=w.livestock(d);print(json.dumps(dict(commands=c,reply=r)))`],{encoding:'utf8',windowsHide:true}));await commands(generated.commands);result.guarded_sheep_count=Object.values(b.entities).filter(e=>e.name==='sheep'&&e.isValid!==false&&JSON.stringify(e.metadata?.[2]||'').includes('FirstNight'+b.username)).length;if(result.guarded_sheep_count!==1)throw Error('Replacement existence guard failed');return generated.reply;}if(path==='/world/survival'&&d.action==='home'){const foot=new Vec3(...d.position);if(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(foot.offset(0,0,1))?.name!=='white_bed')throw Error('Home lacks real bed');await commands([`spawnpoint @s ${d.position.join(' ')}`]);return {position:d.position,owner:b.username};}throw Error('Unexpected production endpoint '+path);};
  if(combatOnly){
   const combat=require('../controller/combat');result.fixture='Real melee damage and pursuit: grounded vs falling sword strikes, then a fleeing cow hunted without lateral controls';result.grants=['Isolated lit platform','Iron sword, wooden sword and immobile tagged husks for measured damage','One tagged cow released to ordinary AI after the first hit'];
   const x=plot.x+10.5,z=plot.z-6.5,healthKey=b.registry.entitiesByName.husk.metadataKeys.indexOf('health');
   await commands([`kill @e[tag=${tag}]`,'clear @s','give @s iron_sword']);await teleport({x,y:plot.y,z});await inventory.equip(b,'iron_sword');
   const nativeAttack=b.attack.bind(b);result.attack_states=[];b.attack=e=>{result.attack_states.push({y:b.entity.position.y,vy:b.entity.velocity.y,ground:b.entity.onGround,mode:b.game.gameMode,sprint:b.getControlState('sprint')});nativeAttack(e);};
   async function husk(critical){
    await commands([`kill @e[tag=${tag}]`,`summon husk ${x+2} ${plot.y} ${z} {Tags:["${tag}"],PersistenceRequired:1b,NoAI:1b,CustomName:'{"text":"CritCheck"}'}`]);
    await teleport({x,y:plot.y,z});const enemy=Object.values(b.entities).find(e=>e.name==='husk'&&e.isValid!==false);if(!enemy)throw Error('Husk not loaded');
    const task={kind:'combat',mobs:['husk'],mob_label:'CritCheck',target_id:enemy.id,bounds,min_y:179,max_y:187,weapon:'iron_sword',kill_target:1,critical_hits:critical};
    const runtime={},before=enemy.metadata[healthKey];if(!Number.isFinite(before))throw Error('No authoritative health metadata');
    const attacked=await combat.interact(b,task,combat.observe(b,task,runtime),runtime,6,{combat_practice:true});await wait(350);
    return {attacked,before,after:enemy.metadata[healthKey],damage:before-enemy.metadata[healthKey],critical_attempts:runtime.criticalAttempts||0};
   }
   result.grounded=await husk(false);result.falling=await husk(true);
   if(!result.falling.critical_attempts||result.falling.damage<=result.grounded.damage)throw Error('Falling strike did not increase real server damage');
   await commands([`kill @e[tag=${tag}]`,'clear @s','give @s wooden_sword',`summon cow ${x+2} ${plot.y} ${z} {Tags:["${tag}"],PersistenceRequired:1b,NoAI:1b,CustomName:'{"text":"FirstNightLabNightCheck"}'}`]);await teleport({x,y:plot.y,z});await inventory.equip(b,'wooden_sword');
   const cow=Object.values(b.entities).find(e=>e.name==='cow'&&e.isValid!==false);if(!cow)throw Error('Cow not loaded');const origin=cow.position.clone(),runtime={};
   const task={kind:'combat',combat_style:'hunt',mobs:['cow'],mob_label:'FirstNightLabNightCheck',target_id:cow.id,bounds,min_y:179,max_y:187,weapon:'wooden_sword',kill_target:1,safe_walk:true,strict_ground:true};
   const releaseCommands=JSON.parse(require('child_process').execFileSync('.venv/Scripts/python.exe',['-c',`import json;from pathlib import Path;from lab.world_training import WorldTraining;from lab.first_night import profile;c=[];w=WorldTraining(Path('logs/unused-native-release.json'),c.append,Path('logs/unused-native-release.log'));w.session=dict(active=True,phase='running',mission='first_night',first_night=profile(0),night_level=0,assessment=False,run='native-release',bots=['LabNightCheck'],bounds=[-274,-218,-150,-94],camp=dict(plots=[dict(x=-248,y=180,z=-124)]));w.livestock(dict(agent='LabNightCheck',run='native-release',action='release',species='cow',entity_uuid='${cow.uuid}'));print(json.dumps(c))`],{encoding:'utf8',windowsHide:true}));await commands([`tag ${cow.uuid} add lab_world_survival`]);let maxMoved=0,lateral=false,released=false;const started=Date.now();
   while(cow.isValid!==false&&Date.now()-started<15000){
    maxMoved=Math.max(maxMoved,cow.position.distanceTo(origin));const sensed=combat.observe(b,task,runtime),rays=scan(b),action=combat.teacher(sensed,task);
    motor.command(action,task,{...sensed,...rays.proximity,cueDistance:sensed.distance},sensed.angle);
    if([4,5,6].includes(action))await combat.interact(b,task,sensed,runtime,action,{combat_practice:true});
    if(runtime.hits&&!released){for(const c of releaseCommands)b.chat('/'+c);released=true;await wait(100);}
    lateral||=!!b.getControlState('left')||!!b.getControlState('right');await wait(50);
   }
   motor.pause();result.hunt={hits:runtime.hits||0,dead:cow.isValid===false,moved_blocks:maxMoved,lateral_controls:lateral,seconds:(Date.now()-started)/1000};
   result.success=result.grounded.attacked&&result.falling.attacked&&result.hunt.dead&&result.hunt.hits>=2&&maxMoved>.3&&!lateral;return;
  }
  if(buildingOnly){
   result.fixture='Eight server-confirmed wall placements with one inventory check per block and reuse of held materials';result.grants=['Isolated illuminated house','64 oak planks'];
   const cells=[];for(const y of [plot.y,plot.y+1])for(let z=plot.z-2;z<=plot.z+1;z++)cells.push({x:plot.x+3,y,z});
   await commands(['clear @s','give @s oak_planks 64',...cells.map(q=>`setblock ${q.x} ${q.y} ${q.z} air`)]);await teleport({x:plot.x+.5,y:plot.y,z:plot.z+.5});
   const started=Date.now();result.placement_ms=[];
   for(const q of cells){const at=Date.now();await t.place(b,q,'oak_planks');result.placement_ms.push(Date.now()-at);if(b.blockAt(new Vec3(q.x,q.y,q.z))?.name!=='oak_planks')throw Error('Placement was not acknowledged by the server');}
   result.seconds=(Date.now()-started)/1000;result.blocks=cells.length;result.success=true;return;
  }
  if(process.argv.includes('--camp-only')||unfinishedPlot||corner||slowRpc){
   result.fixture='Real-server shared-house route: leave a neighboring closed room through its door, then enter the owned closed house.';
   const other={...plot,x:plot.x+10};
   if(!corner&&!unfinishedPlot)await commands([...blueprint(other).map(q=>`setblock ${q.x} ${q.y} ${q.z} ${q.table?'crafting_table':'oak_planks'}`),`setblock ${other.x} ${other.y} ${other.z-3} oak_door[facing=north,half=lower]`,`setblock ${other.x} ${other.y+1} ${other.z-3} oak_door[facing=north,half=upper]`]);
   if(pickupCorner)await commands([`fill ${plot.x+2} ${plot.y} ${plot.z+13} ${plot.x+2} ${plot.y+3} ${plot.z+13} oak_log`]);
   if(ledgeCorner)await commands([`fill ${plot.x+9} ${plot.y} ${plot.z+12} ${plot.x+9} ${plot.y+2} ${plot.z+12} stone`]);
   t.campPlots=[plot,other];t.phase=pickupCorner?'night_food':'stone_return';
   await teleport({x:unfinishedPlot?other.x+.758:ledgeCorner?plot.x+10.7:pickupCorner?plot.x+3.726:corner?plot.x+3.065:other.x+.5,y:other.y,z:unfinishedPlot?other.z-1.385:ledgeCorner?plot.z+12.5:pickupCorner?plot.z+14.641:corner?plot.z-3.471:other.z+.5});await wait(600);if(corner)await b.look(ledgeCorner?Math.PI/2:-1.471,0,true);
   result.start_position=b.entity.position.clone();const started=Date.now();let arrived=false,leftNeighbor=false;const goal=ledgeCorner?[plot.x+10.5,plot.y+.1,plot.z+15.5]:pickupCorner?[plot.x+.2915,plot.y+.1,plot.z+17.9377]:[plot.x+.5,plot.y+.1,plot.z+.5];
   while(!arrived&&Date.now()-started<(corner?20000:slowRpc?180000:60000)){arrived=await t.walk(b,motor,goal,state,api,scan,tasks)===true;if(b.entity.position.z<other.z-4)leftNeighbor=true;await wait(100);}
   motor.pause();result.arrived_home=arrived;result.left_neighbor_through_exit=leftNeighbor;result.seconds=Math.round((Date.now()-started)/100)/10;result.position=b.entity.position.clone();result.navigation=t.lastNavigation;if(slowRpc)result.fixture='Closed-house navigation with a simulated 2.2 second wait for every policy reply';else if(unfinishedPlot)result.fixture='Real-server recovery from an unfinished neighboring plot with an air doorway; no nonexistent-door waiting';else if(ledgeCorner)result.fixture='Native precision alignment: stop before the wall beyond a clear short waypoint, then turn onto the next leg';else if(pickupCorner)result.fixture='Real-server reproduction of the stalled food-pickup route beside a log column';else if(corner)result.fixture='Real-server reproduction of the reported outside-house corner, starting off-center beside the front wall.';result.success=arrived&&(leftNeighbor||corner);return;
  }
  async function leg(phase,until,seconds){t.phase=phase;t.navigator=new WorldNavigation();const started=Date.now();while(t.phase!==until){if(Date.now()-started>seconds*1000)throw Error('Native phase timeout: '+t.phase+' '+t.message);t.wilderness.memory.observe(b);await night.tick(t,b,motor,state,api,scan,tasks,surface);if(Date.now()-(result.pulse||0)>5000){result.pulse=Date.now();console.log(JSON.stringify({phase:t.phase,position:b.entity.position,message:t.message,food:b.inventory.items().map(i=>[i.name,i.count])}));}await wait(100);}motor.pause();result.checks.push({phase,seconds:Math.round((Date.now()-started)/100)/10});}
  if(livestockOnly){
   result.fixture='Supported wool shortage: start with two wool and no sheep, request one guarded replacement, then hunt and pick up the third wool';result.grants=['Isolated lit house and flat lesson pad','Two white wool and one stone axe; the third wool must be collected from the replacement sheep'];
   await commands([`kill @e[tag=${tag}]`,'clear @s','give @s white_wool 2','give @s stone_axe']);await inventory.sync(b);state.world.first_night.stations=true;t.campPlots=[plot];await teleport({x:plot.x+.5,y:plot.y,z:plot.z-15.5});await leg('night_wool','night_wool_home',60);await inventory.sync(b);result.wool=b.inventory.items().filter(i=>i.name==='white_wool').reduce((n,i)=>n+i.count,0);result.success=result.wool===3&&result.guarded_sheep_count===1&&result.refill_requests===1;return;
  }
  if(bootstrapStance){const table=require('../controller/house').point(plot,'table');await teleport({x:table.x+1.28,y:table.y,z:table.z+.3});result.start_position=b.entity.position.clone();}
  await leg('night_bootstrap','gather',30);if(!b.inventory.items().some(i=>i.name==='wooden_axe'))throw Error('Early axe was not crafted');
  if(bootstrapStance){result.fixture='Native workbench self-overlap regression: move from the old unsafe accepted stance, settle, then craft and place the early table and axe';result.workbench=b.blockAt(require('../controller/house').point(plot,'table'))?.name==='crafting_table';result.axe=b.inventory.items().some(i=>i.name==='wooden_axe');result.success=result.workbench&&result.axe;return;}
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

const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {route,standable}=require('../controller/field_navigation');
const {blueprint,intact,findPlot}=require('../controller/hut_teacher');
function fixture(blocks={}){return {entity:{position:new Vec3(.5,64,.5)},blockAt(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);const name=blocks[`${x},${y},${z}`]||(y<64?'grass_block':'air');return name==='unloaded'?null:{name,boundingBox:['air','water','lava'].includes(name)?'empty':'block',position:new Vec3(x,y,z)};}};}

test('travel lookahead joins a straight run but preserves turns, rises and sideways centering',()=>{
 const {travelCue}=require('../controller/world_navigation'),p=new Vec3(.5,64,.5),a=[.5,64.1,1.5],b=[.5,64.1,2.5],c=[1.5,64.1,2.5];
 assert.equal(travelCue(p,[a,b,c]),b);
 assert.equal(travelCue(p,[a,[.5,65.1,2.5]]),a);
 assert.equal(travelCue(new Vec3(.1,64,.5),[[.5,64.1,.5],[.5,64.1,1.5]])[2],.5);
});

test('closed raised-house approach uses the actual exterior ground height',()=>{
 const {homeApproach,approachGoal}=require('../controller/world_navigation'),b=fixture(),plot={x:0,y:65,z:0};
 b.entity.position=new Vec3(.5,64,-8.5);const original=b.blockAt;
 b.blockAt=p=>p.x===0&&p.y===65&&p.z===-3?{name:'oak_door',getProperties:()=>({open:false})}:original(p);
 assert.deepEqual(homeApproach(plot,b),[.5,64.1,-4.5]);
 assert.deepEqual(approachGoal(b,[.5,65.1,.5],plot),[.5,64.1,-4.5]);
 const p=route(b,homeApproach(plot,b),16,512);assert.equal(p.reached,true);
});

test('off-center movement beside a diagonal workbench aligns inside its clear cell first',()=>{
 const b=fixture({'-3,64,1':'crafting_table'});b.entity.position=new Vec3(-1.8514,64,2.6204);b.entity.onGround=true;
 const planned=route(b,[-1.5,64.1,-.5],16,512,true,{reversible:true});
 assert.equal(planned.reached,true);assert.equal(planned.path[0].centering,true);
 assert.deepEqual([...planned.path[0]],[-1.5,64.1,2.5]);
});

test('a body partly across a terrace edge continues to the lower landing instead of reversing uphill',()=>{
 const bot={players:{},entity:{position:new Vec3(.5,64,-.265),onGround:true},blockAt(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),floor=64+Math.min(0,z);return {name:y<floor?'stone':'air',position:new Vec3(x,y,z),boundingBox:y<floor?'block':'empty'};}};
 const planned=route(bot,[.5,62.1,-1.5],8,128,true,{reversible:true});assert.equal(planned.reached,true);assert.deepEqual([...planned.path[0]],[.5,63.1,-.5]);assert.equal(planned.path[0].centering,true);
});

test('tree focus survives nearest-distance crossover but releases depleted trees',()=>{
 const {treeFocus}=require('../controller/world_timing'),a=new Vec3(0,64,0),b=new Vec3(3,64,0);
 const selected=treeFocus([a,b],null);assert.equal(selected.key,'0,0');
 assert.deepEqual(treeFocus([b,a],selected.key).targets,[a]);
 assert.equal(treeFocus([b],selected.key).key,'3,0');assert.equal(treeFocus([],selected.key).key,null);
});

test('peripheral acquisition scans behind the bot and accepts only actual log hits',()=>{
 const {scanTrees}=require('../controller/target_scan');let rays=0;
 const log=new Vec3(0,70,8),bot={entity:{position:new Vec3(0,70,0),yaw:0},world:{raycast(eye,dir){rays++;return dir.z>.99?{name:'oak_log',position:log}:dir.z<-.99?{name:'stone',position:new Vec3(0,70,-4)}:null;}}};
 assert.deepEqual(scanTrees(bot),[log]);assert.equal(rays,72);
 bot.world.raycast=()=>({name:'stone',position:new Vec3(0,70,4)});assert.deepEqual(scanTrees(bot),[]);
});

test('elevated blocks remain visible when the near-corner distance truncates a ray; walls still occlude',()=>{
 const {visibleBlock}=require('../controller/target_scan'),registry=require('minecraft-data')('1.21.4'),World=require('prismarine-world')('1.21.4'),Chunk=require('prismarine-chunk')('1.21.4');
 const world=new World(null).sync;world.setColumn(0,0,new Chunk());
 const target=new Vec3(1,73,2);world.setBlockStateId(target,registry.blocksByName.stone.defaultState);
 const bot={world,entity:{position:new Vec3(.498247,70,.365373),eyeHeight:1.62}},block=world.getBlock(target),eye=bot.entity.position.offset(0,1.62,0),direction=target.offset(.5,.5,.5).minus(eye).normalize();
 assert.equal(world.raycast(eye,direction,eye.distanceTo(target)),null);
 assert.equal(visibleBlock(bot,block),true);
 world.setBlockStateId(new Vec3(0,72,1),registry.blocksByName.stone.defaultState);
 assert.equal(visibleBlock(bot,block),false);
});

test('settlement chest fits inside the hut and teaching milestones are idempotent',()=>{
 const {chestPosition,TOOLS}=require('../controller/settlement'),{HutTeacher}=require('../controller/hut_teacher');
 const plot={x:20,y:70,z:30},chest=chestPosition(plot);
 assert.ok(Math.abs(chest.x-plot.x)<=2&&Math.abs(chest.z-plot.z)<=2);
 assert.equal(blueprint(plot).some(p=>p.x===chest.x&&p.y===chest.y&&p.z===chest.z),false);
 assert.deepEqual(TOOLS,['wooden_pickaxe','wooden_axe','wooden_shovel']);
 const teacher=new HutTeacher();teacher.milestones=[];teacher.milestone('hut');teacher.milestone('hut');assert.deepEqual(teacher.milestones,['hut']);
});

test('world timings include blocking work and count rapid turn reversals',()=>{
 const {WorldTiming}=require('../controller/world_timing'),t=new WorldTiming(1000);
 t.mark('gather','aligning',2000);t.action(1,2000);t.action(2,2100);t.action(1,5000);
 t.mark('gather','harvesting',5000);const snapshot=t.snapshot(1,9000);
 assert.equal(snapshot.phase_seconds.gather,7);assert.equal(snapshot.activity_seconds.aligning,3);assert.equal(snapshot.activity_seconds.harvesting,4);
 assert.equal(snapshot.first_log_seconds,8);assert.equal(snapshot.turn_reversals,1);
});

test('a new world batch clears the previous hut and progress before reporting survey',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),teacher=new HutTeacher();
 Object.assign(teacher,{run:'old',plot:{x:5,y:64,z:5},table:{x:3,y:64,z:6},built:55,secureAt:100,settle:9999999999999,resources:[new Vec3(1,64,1)],destination:'old destination'});
 const bot=fixture();bot.username='LabAI0';bot.health=20;bot.food=20;bot.game={gameMode:'survival'};bot.inventory={items:()=>[{name:'oak_log',count:9}]};
 const reports=[];
 await teacher.tick(bot,{pause(){}},{run:'new',world:{bounds:[-64,64,-64,64]}},async(path,data)=>reports.push(data),null,{createRuntime:()=>({})});
 assert.equal(teacher.phase,'survey');assert.equal(teacher.built,0);assert.equal(teacher.plot,null);assert.equal(teacher.table,null);
 assert.equal(teacher.secureAt,null);assert.equal(teacher.settle,0);assert.deepEqual(teacher.resources,[]);assert.equal(teacher.destination,null);
 assert.equal(reports[0].blocks,0);assert.equal(reports[0].plot,null);assert.equal(reports[0].logs,0);assert.equal(reports[0].timings.first_log_seconds,null);
});

test('a motionless world attempt reports failure and releases the batch instead of freezing',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),teacher=new HutTeacher(),bot=fixture();
 Object.assign(bot,{username:'LabAI0',health:20,food:20,game:{gameMode:'survival'},inventory:{items:()=>[]}});
 const reports=[],state={run:'stall-test',world:{bounds:[-64,64,-64,64]}},api=async(path,data)=>reports.push(data),tasks={createRuntime:()=>({})},motor={pause(){}};
 await teacher.tick(bot,motor,state,api,null,tasks);teacher.phase='gather';teacher.stall.update(bot.entity.position,require('../controller/world_stall').progressSignature(teacher,''),Date.now()-91000);
 teacher.lastNavigation={phase:'gather',position:[.5,64,.5],cue:[1.5,64.1,.5],decision:{selected:1,teacher:0,angle:-.2}};
 await teacher.tick(bot,motor,state,api,null,tasks);
 assert.equal(teacher.phase,'stopped');assert.equal(reports.at(-1).state,'stopped');assert.match(reports.at(-1).message,/Stationary for 90 seconds/);assert.equal(reports.at(-1).stall_seconds_left,null);
 assert.deepEqual(reports.at(-1).navigation,teacher.lastNavigation,'The sky-lounge teleport must not erase the failure position and last decision');
});
test('field routing avoids water, walls and unloaded blocks while finding a detour',()=>{
 const blocks={};for(let z=-3;z<=3;z++){blocks[`3,64,${z}`]='stone';blocks[`3,65,${z}`]='stone';blocks[`3,66,${z}`]='stone';}
 const bot=fixture(blocks),result=route(bot,[10.5,64,.5]);assert.ok(result.path.length>10);assert.ok(result.path.some(p=>Math.abs(p[2])>3));assert.ok(result.expanded<=4096);
 blocks['0,63,0']='water';assert.equal(standable(bot,0,64,0),false);assert.equal(route(bot,[10,64,0]).path.length,0);
 blocks['0,63,0']='unloaded';assert.equal(standable(bot,0,64,0),false);
});
test('hut has real walls, roof and a two-block doorway; completion requires every block',()=>{
 const plot={x:0,y:64,z:0},blocks=blueprint(plot);assert.equal(blocks.length,144);assert.equal(new Set(blocks.map(p=>JSON.stringify(p))).size,144);
 assert.equal(blocks.some(p=>p.x===0&&p.z===-3&&p.y<66),false);
 const map=Object.fromEntries(blocks.map(p=>[`${p.x},${p.y},${p.z}`,p.table?'crafting_table':'oak_planks'])),bot=fixture(map);assert.equal(intact(bot,plot),true);delete map['3,64,0'];assert.equal(intact(bot,plot),false);
});
test('natural plots are flat, separated by sectors and never created by filling terrain',()=>{
 const bot=fixture();const a=findPlot(bot,[-64,64,-64,64],0,9),b=findPlot(bot,[-64,64,-64,64],1,9);assert.ok(a&&b);assert.ok(Math.abs(a.x-b.x)>=7);assert.equal(a.y,64);
});

test('floor work stances stay clear of the target even when navigation stops short of center',()=>{
 const {stances}=require('../controller/floor_builder'),house=require('../controller/house'),b=fixture(),plot={x:0,y:64,z:0},q={x:0,y:63,z:0};
 const choices=stances({plot},b,q,house.blueprint(plot).filter(p=>p.floor),{world:{bounds:[-20,20,-20,20]}});
 assert.ok(choices.length);
 for(const {goal} of choices){
  const dx=q.x+.5-goal[0],dz=q.z+.5-goal[2],d=Math.hypot(dx,dz);
  const arrived={x:goal[0]+dx/d*.4,z:goal[2]+dz/d*.4};
  assert.ok(Math.abs(arrived.x-q.x-.5)>=.85||Math.abs(arrived.z-q.z-.5)>=.85,'arrival must clear the dig footprint');
 }
});

test('house plot allocation searches dry land outside watery sectors without overlapping homes',()=>{
 const {claimPlot}=require('../controller/hut_teacher'),bot=fixture(),original=bot.blockAt;
 bot.blockAt=p=>p.z>=-5&&Math.floor(p.y)===63?{name:'water',boundingBox:'empty',position:p}:original(p);
 const world={bounds:[-64,64,-64,64],count:8,spread:9},plots=[];
 // A later bot ticking first must still reserve in roster order.
 assert.ok(claimPlot(bot,{...world,index:7},'plot-water-test'));
 for(let index=0;index<8;index++){
  const plot=claimPlot(bot,{...world,index},'plot-water-test');assert.ok(plot);assert.ok(plot.z+3<-5);
  for(const other of plots)assert.ok(Math.abs(plot.x-other.x)>=10||Math.abs(plot.z-other.z)>=10);
  plots.push(plot);
 }
 assert.equal(claimPlot(bot,{...world,index:7},'plot-water-test'),plots[7]);
 assert.deepEqual(claimPlot(bot,{...world,index:0},'fresh-plot-water-test'),plots[0]);
});

test('larger house has a complete floor, clear headroom and separate furniture cells',()=>{
 const house=require('../controller/house'),plot={x:0,y:64,z:0},blocks=blueprint(plot),floor=blocks.filter(q=>q.floor);
 assert.equal(floor.length,25);assert.equal(blocks.filter(q=>q.y===67).length,49);
 const occupied=['chest','furnace','bed'].map(key=>house.point(plot,key));occupied.push(house.point(plot,'bed').offset(0,0,1));
 assert.equal(new Set(occupied.map(p=>p.toString())).size,4);
 for(const p of occupied){assert.ok(floor.some(q=>q.x===p.x&&q.z===p.z));assert.ok(!blocks.some(q=>q.x===p.x&&q.y===p.y&&q.z===p.z));}
 for(let y=64;y<67;y++)assert.ok(!blocks.some(q=>q.x===0&&q.z===0&&q.y===y));
});

test('floor laying never digs the block supporting the bot and moves aside for the last tile',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),t=new HutTeacher(),bot=fixture(),dug=[];t.plot={x:0,y:64,z:0};
 bot.dig=async block=>dug.push(block.position);t.place=async()=>{};
 await t.buildFloor(bot,{pause(){}},{},null,null,null);assert.equal(dug.length,1);assert.ok(dug.every(q=>q.x!==0||q.z!==0));
 const blocks=Object.fromEntries(blueprint(t.plot).filter(q=>q.floor&&(q.x!==0||q.z!==0)).map(q=>[`${q.x},${q.y},${q.z}`,'oak_planks']));
 const last=fixture(blocks);let goal;t.walk=async(b,m,g)=>{goal=g;};last.dig=async()=>assert.fail('Must move off the remaining tile first');
 await t.buildFloor(last,{pause(){}},{},null,null,null);assert.ok(goal);assert.ok(goal[0]!==.5||goal[2]!==.5);
});

test('a bot in the enlarged room center can place the door without repeatedly returning to center',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),t=new HutTeacher(),bot=fixture();
 Object.assign(bot,{username:'LabAI0',health:20,food:20,game:{gameMode:'survival'},inventory:{items:()=>[{name:'oak_door',count:3}]},look:async()=>{}});
 const state={run:'door-reach',world:{bounds:[-64,64,-64,64]}},motor={pause(){}},api=async()=>{},tasks={createRuntime:()=>({})};
 await t.tick(bot,motor,state,api,null,tasks);Object.assign(t,{phase:'door',plot:{x:0,y:64,z:0},settle:0});let placed=false;
 t.place=async()=>{placed=true;};t.walk=async()=>assert.fail('Door is within native placement reach from the room center');
 await t.tick(bot,motor,state,api,null,tasks);assert.equal(placed,true);assert.equal(t.phase,'enter');
});

test('shared natural spawn avoids nearby lava and exposed cave pockets',()=>{
 const {surface,findSpawn}=require('../controller/hut_teacher');
 const bot=fixture({'0,64,0':'lava'});assert.equal(surface(bot,0,0),null);
 const spawn=findSpawn(bot,[-64,64,-64,64]);assert.ok(spawn);assert.ok(Math.hypot(spawn[0]-.5,spawn[2]-.5)>6);
});

test('crafting recipes map correctly to native personal and workbench grids',()=>{
 const {recipeSlots}=require('../controller/crafting'),ingredient={id:1};
 assert.deepEqual(recipeSlots({inShape:[[ingredient,ingredient],[ingredient,ingredient]]},2).map(v=>v.slot),[1,2,3,4]);
 assert.deepEqual(recipeSlots({inShape:[[ingredient,ingredient],[ingredient,ingredient],[ingredient,ingredient]]},3).map(v=>v.slot),[1,2,4,5,7,8]);
 assert.deepEqual(recipeSlots({ingredients:[ingredient]},2).map(v=>v.slot),[1]);
});

test('authoritative cursor and player inventory updates map to their real slots',()=>{
 const {EventEmitter}=require('node:events'),registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry),{attach,playerSlot}=require('../controller/inventory_sync');
 const slots=[],client=new EventEmitter(),bot={registry,_client:client,inventory:{slots,updateSlot:(i,v)=>{slots[i]=v;}}};attach(bot);
 client.emit('set_cursor_item',{contents:Item.toNotch(new Item(registry.itemsByName.oak_planks.id,4))});assert.equal(bot.inventory.selectedItem.count,4);
 client.emit('set_slot',{windowId:-2,slot:0,item:Item.toNotch(new Item(registry.itemsByName.oak_log.id,16))});assert.equal(slots[36].count,16);
 assert.equal(playerSlot(40),45);assert.equal(playerSlot(36),8);
 client.emit('set_slot',{windowId:-1,slot:-1,item:Item.toNotch(null)});assert.equal(bot.inventory.selectedItem,null);
});

test('resource pickup routes reach the actual goal instead of stopping a block away',()=>{
 const bot=fixture();bot.entity.position=new Vec3(.05,64,.05);const result=route(bot,[.95,64,.95]);assert.ok(result.path.length);assert.equal(result.path.at(-1)[0],.95);assert.equal(result.path.at(-1)[2],.95);
});

test('construction budget accounts for existing walls, workbench and crafted doors on resume',()=>{
 const {HutTeacher,blueprint}=require('../controller/hut_teacher'),teacher=new HutTeacher(),plot={x:0,y:64,z:0};teacher.plot=plot;
 const bot=fixture();bot.inventory={items:()=>[]};assert.equal(teacher.requiredWood(bot),153);
 const pieces=blueprint(plot).filter(q=>!q.table).slice(0,6),map=Object.fromEntries(pieces.map(q=>[`${q.x},${q.y},${q.z}`,'oak_planks']));map['-3,64,1']='crafting_table';
 const resumed=fixture(map);resumed.inventory={items:()=>[{name:'oak_door',count:3}]};assert.equal(teacher.requiredWood(resumed),137);
});

test('world navigation replans after a blocked local recovery without extending its progress deadline',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),teacher=new HutTeacher(),bot=fixture();
 bot.entity.yaw=0;bot.entity.onGround=true;bot.health=20;bot.food=20;bot.username='LabAI0';
 Object.assign(teacher,{path:[],lastPlan:0,plot:null,runtime:{},phase:'stone_return',timing:new WorldTiming(Date.now()),lastProgress:123});
 let blocked=true,paused=0;const motor={status:()=>blocked?'Recovering: no checked local route; waiting for reset':null,pause:()=>{paused++;blocked=false;},command:()=>null};
 await teacher.walk(bot,motor,[4.5,64,.5],{run:'test',world:{bounds:[-64,64,-64,64],driver:'teacher'}},async()=>({action:0}),()=>({pooled:Array(64).fill(0),proximity:{}}),{observeTask:()=>({extra:Array(12).fill(0),metrics:{}}),teacherAction:()=>0});
 assert.equal(paused,1);assert.ok(teacher.path.length);assert.equal(teacher.lastProgress,123);
});

test('placement uses a plain support instead of opening the workbench',()=>{
 const {reference}=require('../controller/hut_teacher'),bot=fixture({'0,63,0':'crafting_table','1,64,0':'oak_planks'});const ref=reference(bot,{x:0,y:64,z:0});assert.equal(ref.block.name,'oak_planks');
});

test('construction equips from main inventory with an authoritative hotbar swap',async()=>{
 const {EventEmitter}=require('node:events'),{equip}=require('../controller/inventory_sync'),registry=require('minecraft-data')('1.21.4');
 const bot=new EventEmitter(),slots=[];slots[9]={name:'oak_planks',type:registry.itemsByName.oak_planks.id,count:4,slot:9};
 Object.assign(bot,{registry,quickBarSlot:0,currentWindow:null,inventory:{id:0,slots,items:()=>slots.filter(Boolean)},_syncWindow:async()=>{},setQuickBarSlot:n=>{bot.quickBarSlot=n;}});
 Object.defineProperty(bot,'heldItem',{get:()=>slots[36+bot.quickBarSlot]});let swaps=0;
 bot._client={write:(packet,data)=>{if(packet==='window_click'&&data.mode===2){swaps++;[slots[data.slot],slots[36+data.mouseButton]]=[slots[36+data.mouseButton],slots[data.slot]];queueMicrotask(()=>bot.emit('setWindowItems:0'));}}};
 await equip(bot,'oak_planks');assert.equal(swaps,1);assert.equal(bot.heldItem.name,'oak_planks');assert.equal(slots[9],undefined);
});


test('holding the confirmed building material does not request another inventory round trip',async()=>{
 const {equip}=require('../controller/inventory_sync');let syncs=0;
 const bot={heldItem:{name:'oak_planks',count:32},_syncWindow:async()=>{syncs++;}};
 await equip(bot,'oak_planks');assert.equal(syncs,0);
});


test('survey flight holds gravity without disabling controller physics ticks and restores it afterward',()=>{
 const survey=require('../controller/survey'),bot={physics:{gravity:.08},entity:{velocity:new Vec3(1,-1,1)},physicsEnabled:true};
 survey.hold(bot);survey.hold(bot);assert.equal(bot.physics.gravity,0);assert.deepEqual(bot.entity.velocity,new Vec3(0,0,0));assert.equal(bot.physicsEnabled,true);
 survey.release(bot);assert.equal(bot.physics.gravity,.08);survey.release(bot);assert.equal(bot.physics.gravity,.08);
});

test('safe spawn survey can find dry shore beyond the old central search area',()=>{
 const {findSpawn}=require('../controller/hut_teacher');
 const bot=fixture();bot.blockAt=p=>{const q=p.floored(),dry=q.x>=27&&q.x<=48,name=q.y<64?(dry?'grass_block':'water'):'air';return {position:q,name,boundingBox:name==='grass_block'?'block':'empty'};};
 const spawn=findSpawn(bot,[-64,64,-64,64],{margin:24});assert.ok(spawn);assert.ok(spawn[0]>24&&spawn[0]<41);
});


test('an off-center body at a terrace lip centers before moving along the edge',()=>{
 const b={players:{},entity:{position:new Vec3(.5,64,.12),onGround:true,yaw:Math.PI},blockAt(p){const q=p.floored(),solid=q.y<(q.z<0?63:64);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const plan=route(b,[-1.5,64.1,.5],8,128,true,{reversible:true});assert.equal(plan.reached,true);assert.equal(plan.path[0].centering,true);assert.deepEqual([...plan.path[0]],[.5,64.1,.5]);
 const {proximity}=require('../controller/perception'),near=proximity(b,{recovery:false});assert.equal(near.canWalk(Math.PI/2,.75),false);assert.equal(near.canWalk(Math.PI,.35),true);
});

test('a grounded bot approaching a safe downhill step does not retreat to its upper cell center',()=>{
 const b={players:{},entity:{position:new Vec3(.5,64,.12),onGround:true,yaw:0},blockAt(p){const q=p.floored(),solid=q.y<(q.z<0?63:64);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const plan=route(b,[.5,63.1,-2.5],8,128,true,{reversible:true});assert.equal(plan.reached,true);assert.deepEqual([...plan.path[0]],[.5,63.1,-.5]);
});
test('tree work retains an in-reach upper log from current footing rather than revisiting its approach',()=>{
 const {chooseTree,standingTarget}=require('../controller/tree_target');const b=fixture({'2,65,0':'oak_log','2,66,0':'oak_log'});b.entity.onGround=true;b.entity.eyeHeight=1.62;b.canDigBlock=()=>true;b.canSeeBlock=()=>true;b.world={raycast:(eye,d,range)=>({position:eye.plus(d.scaled(range-.05)).floored()})};
 const blocks=[new Vec3(2,65,0),new Vec3(2,66,0)];const picked=standingTarget(b,blocks);assert.ok(picked);const tree=chooseTree(b,blocks,'2,0',()=>64,'fixture',[3.5,64.1,.5]);assert.equal(tree.key,'2,0');assert.deepEqual(tree.approach,[.5,64.1,.5]);
 b.entity.onGround=false;assert.equal(standingTarget(b,blocks),null);
});

test('a late grounded update beyond a landing continues forward without returning to its center',()=>{
 const {WorldNavigation}=require('../controller/world_navigation');const b={players:{},entity:{position:new Vec3(.5,63,-.8),onGround:true,yaw:0},blockAt(p){const q=p.floored(),solid=q.y<(q.z<0?63:64);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const nav=new WorldNavigation(),goal=[.5,63.1,-2.5],landing=[.5,63.1,-.5];landing.centering=true;
 Object.assign(nav,{destination:goal.join(','),path:[landing,[.5,63.1,-1.5],goal],anchor:[.5,64.1,.5],lastPlan:1000,progressAt:1000,lastPosition:[.5,63.5,-.65]});
 const plan=nav.plan(b,goal,{now:1100});assert.equal(plan.path.includes(landing),false);assert.ok(plan.cue[2]<b.entity.position.z);
 const corner=new WorldNavigation();Object.assign(corner,{destination:goal.join(','),path:[landing,[-.5,63.1,-.5],goal],anchor:[.5,64.1,.5],lastPlan:1000,progressAt:1000,lastPosition:[.5,63.5,-.65]});
 assert.equal(corner.plan(b,goal,{now:1100}).path[0],landing,'turns still require the checked corner');
});


test('home approaches fall back to dry exterior ground when the preferred marker is obstructed',()=>{
 const {homeApproach}=require('../controller/world_navigation'),b=fixture({'0,64,-5':'stone'}),h={x:0,y:64,z:0},g=homeApproach(h,b);
 assert.notDeepEqual(g,[.5,64.1,-4.5]);assert.equal(standable(b,Math.floor(g[0]),Math.round(g[1]),Math.floor(g[2])),true);
});

test('new house plots require a usable exit apron beyond the flat room',()=>{
 const {usableEntrance}=require('../controller/hut_teacher'),h={x:0,y:64,z:0};
 assert.equal(usableEntrance(fixture(),h),true);
 const b=fixture({'0,63,-5':'water'});assert.equal(usableEntrance(b,h),true,'source-water shoreline is a valid transit site');
 assert.equal(usableEntrance(fixture({'0,63,-5':'lava'}),h),false,'lava is not an acceptable exit');
});

test('a long loaded route advances a verified prefix after exhausting its search budget',()=>{
 const {WorldNavigation}=require('../controller/world_navigation'),b=fixture();b.entity.onGround=true;
 const at=b.blockAt;b.blockAt=p=>Math.floor(p.x)===50&&Math.abs(Math.floor(p.z))<=90&&p.y>=64&&p.y<67?{name:'stone',boundingBox:'block',position:p.floored()}:at(p);
 const n=new WorldNavigation(),plan=n.plan(b,[100.5,64.1,.5],{bounds:[-10,130,-110,110],now:1000});
 assert.equal(n.partial,true);assert.equal(n.blocked,false);assert.ok(n.path.length>0&&n.path.length<=12);assert.equal(plan.arrived,false);
});

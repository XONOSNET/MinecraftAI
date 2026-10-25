const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {route,standable}=require('../controller/field_navigation');
const {blueprint,intact,findPlot}=require('../controller/hut_teacher');
function fixture(blocks={}){return {entity:{position:new Vec3(.5,64,.5)},blockAt(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);const name=blocks[`${x},${y},${z}`]||(y<64?'grass_block':'air');return name==='unloaded'?null:{name,boundingBox:['air','water','lava'].includes(name)?'empty':'block',position:new Vec3(x,y,z)};}};}

test('tree focus survives nearest-distance crossover but releases depleted trees',()=>{
 const {treeFocus}=require('../controller/world_timing'),a=new Vec3(0,64,0),b=new Vec3(3,64,0);
 const selected=treeFocus([a,b],null);assert.equal(selected.key,'0,0');
 assert.deepEqual(treeFocus([b,a],selected.key).targets,[a]);
 assert.equal(treeFocus([b],selected.key).key,'3,0');assert.equal(treeFocus([],selected.key).key,null);
});

test('settlement chest fits inside the hut and teaching milestones are idempotent',()=>{
 const {chestPosition,TOOLS}=require('../controller/settlement'),{HutTeacher}=require('../controller/hut_teacher');
 const plot={x:20,y:70,z:30},chest=chestPosition(plot);
 assert.ok(Math.abs(chest.x-plot.x)<2&&Math.abs(chest.z-plot.z)<2);
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
 const bot=fixture();bot.username='LabAI0';bot.health=20;bot.food=20;bot.game={gameMode:'survival'};bot.inventory={items:()=>[]};
 const reports=[];
 await teacher.tick(bot,{pause(){}},{run:'new',world:{bounds:[-64,64,-64,64]}},async(path,data)=>reports.push(data),null,{createRuntime:()=>({})});
 assert.equal(teacher.phase,'survey');assert.equal(teacher.built,0);assert.equal(teacher.plot,null);assert.equal(teacher.table,null);
 assert.equal(teacher.secureAt,null);assert.equal(teacher.settle,0);assert.deepEqual(teacher.resources,[]);assert.equal(teacher.destination,null);
 assert.equal(reports[0].blocks,0);assert.equal(reports[0].plot,null);
});
test('field routing avoids water, walls and unloaded blocks while finding a detour',()=>{
 const blocks={};for(let z=-3;z<=3;z++){blocks[`3,64,${z}`]='stone';blocks[`3,65,${z}`]='stone';blocks[`3,66,${z}`]='stone';}
 const bot=fixture(blocks),result=route(bot,[10.5,64,.5]);assert.ok(result.path.length>10);assert.ok(result.path.some(p=>Math.abs(p[2])>3));assert.ok(result.expanded<=4096);
 blocks['0,63,0']='water';assert.equal(standable(bot,0,64,0),false);assert.equal(route(bot,[10,64,0]).path.length,0);
 blocks['0,63,0']='unloaded';assert.equal(standable(bot,0,64,0),false);
});
test('hut has real walls, roof and a two-block doorway; completion requires every block',()=>{
 const plot={x:0,y:64,z:0},blocks=blueprint(plot);assert.equal(blocks.length,55);assert.equal(new Set(blocks.map(p=>JSON.stringify(p))).size,55);
 assert.equal(blocks.some(p=>p.x===0&&p.z===-2&&p.y<66),false);
 const map=Object.fromEntries(blocks.map(p=>[`${p.x},${p.y},${p.z}`,p.table?'crafting_table':'oak_planks'])),bot=fixture(map);assert.equal(intact(bot,plot),true);delete map['2,64,0'];assert.equal(intact(bot,plot),false);
});
test('natural plots are flat, separated by sectors and never created by filling terrain',()=>{
 const bot=fixture();const a=findPlot(bot,[-64,64,-64,64],0,9),b=findPlot(bot,[-64,64,-64,64],1,9);assert.ok(a&&b);assert.ok(Math.abs(a.x-b.x)>=7);assert.equal(a.y,64);
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
 const bot=fixture();bot.inventory={items:()=>[]};assert.equal(teacher.requiredWood(bot),64);
 const pieces=blueprint(plot).filter(q=>!q.table).slice(0,6),map=Object.fromEntries(pieces.map(q=>[`${q.x},${q.y},${q.z}`,'oak_planks']));map['-2,64,1']='crafting_table';
 const resumed=fixture(map);resumed.inventory={items:()=>[{name:'oak_door',count:3}]};assert.equal(teacher.requiredWood(resumed),48);
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

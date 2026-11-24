const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const recovery=require('../controller/stone_mine_recovery'),night=require('../controller/first_night');
const house=require('../controller/house'),inventory=require('../controller/inventory_sync');

function fixture(ctx,stock={}){
 const items={...stock},plot={x:0,y:64,z:0},cells=new Map();
 cells.set(house.point(plot,'table').toString(),'crafting_table');
 const b={username:'MineRecoveryTest',health:20,food:20,entities:{},players:{},time:{timeOfDay:6000},
  entity:{position:new Vec3(.5,64.1,.5),onGround:true},
  inventory:{items:()=>Object.entries(items).filter(([,count])=>count>0).map(([name,count])=>({name,count}))},
  blockAt:q=>({name:cells.get(q.toString())||'air',position:q,boundingBox:cells.has(q.toString())?'block':'empty'})};
 const crafts=[],t={run:'recovery-test',phase:'night_stone',plot,milestones:[],navigator:{},path:[],
  walk:async(_b,_m,goal)=>{b.entity.position=new Vec3(...goal);return true;},
  craft:async(_b,name)=>{
   const take=(item,number)=>{assert.ok(items[item]>=number,`${item} stock for ${name}`);items[item]-=number;};
   crafts.push(name);
   if(name==='oak_planks'){take('oak_log',1);items.oak_planks=(items.oak_planks||0)+4;}
   else if(name==='furnace'){take('cobblestone',8);items.furnace=1;}
   else if(name==='torch'){take(items.coal?'coal':'charcoal',1);take('stick',1);items.torch=(items.torch||0)+4;}
   else if(name==='stick'){take('oak_planks',2);items.stick=(items.stick||0)+4;}
   else if(name==='wooden_pickaxe'){take('oak_planks',3);take('stick',2);items.wooden_pickaxe=1;}
   else assert.fail('unexpected recipe '+name);
  }};
 night.init(t,{});
 const route={run:t.run,owner:b.username,entry:[12,64,0],path:[[12,64,0],[13,63,0]],recoveries:1};
 const motor={pause(){}},state={world:{bounds:[-30,30,-30,30],first_night:{id:3,hostiles:true}}};
 ctx.mock.method(inventory,'sync',async()=>{});
 ctx.mock.method(inventory,'equip',async(_b,name)=>{assert.ok(items[name]);b.heldItem={name};});
 ctx.mock.method(require('../controller/station_placement'),'place',async(_t,_b,_m,pos,name)=>{
  assert.ok(items[name]);items[name]--;cells.set(pos.toString(),name);return true;
 });
 ctx.mock.method(require('../controller/furnace'),'charcoal',async()=>{
  assert.ok(items.oak_log&&items.oak_planks);items.oak_log--;items.oak_planks--;items.charcoal=(items.charcoal||0)+1;
 });
 return {t,b,items,crafts,cells,route,motor,state};
}

test('a completed empty stone trip requests supplies before exploration discards the mine',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1}),mine=require('../controller/staircase_mining');
 f.b.entity.position=new Vec3(12.5,64.1,.5);f.t.wilderness.mine={stage:'done'};
 ctx.mock.method(mine,'tick',async()=>({handled:true,recovery:'light',resume:f.route}));
 ctx.mock.method(require('../controller/resource_scan'),'stone',()=>assert.fail('recovery precedes another resource search'));
 await night.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.mine,null);assert.equal(f.t.wilderness.stoneRecovery.route,f.route);
 assert.deepEqual(f.t.milestones,[]);
});

test('a torch return spends real stone and wood, then supplies the same route for revalidation',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,cobblestone:12,oak_log:4,stick:4});
 recovery.request(f.t,{recovery:'light',resume:f.route});
 for(let i=0;i<20&&f.t.wilderness.stoneRecovery;i++)await recovery.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.items.cobblestone,4);assert.equal(f.cells.get(house.point(f.t.plot,'furnace').toString()),'furnace');
 assert.equal(f.items.torch,8);assert.ok(f.items.oak_log<4);
 assert.deepEqual(f.crafts,['furnace','oak_planks','torch','torch']);
 assert.equal(f.t.wilderness.stoneRoute,f.route);assert.equal(f.t.phase,'night_stone');
 assert.deepEqual(f.t.milestones,[],'recovery earns no lesson milestone');
});

test('torch recovery obtains missing wood through gathering before the ordinary fuel trip can advance',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,cobblestone:8});
 recovery.request(f.t,{recovery:'light',resume:f.route});
 assert.equal(await recovery.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.t.phase,'gather');
 f.items.oak_log=3;
 assert.equal(await recovery.tick(f.t,f.b,f.motor,f.state),true);assert.equal(f.t.phase,'night_stone');
 for(let i=0;i<20&&f.t.wilderness.stoneRecovery;i++)await recovery.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.items.torch,8);assert.equal(f.t.wilderness.stoneRoute,f.route);
 assert.equal(f.t.wilderness.fuelTrip,false);
});

test('furnace placement can finish a checked alternate stance without returning to the room center each tick',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,cobblestone:8,oak_log:3,stick:4}),stance=new Vec3(-.5,64.1,.5);
 let placements=0;
 ctx.mock.method(require('../controller/station_placement'),'place',async(_t,_b,_m,pos)=>{
  if(++placements===1){f.b.entity.position=stance.clone();return false;}
  assert.deepEqual(f.b.entity.position,stance,'continue the placement approach');
  f.items.furnace--;f.cells.set(pos.toString(),'furnace');return true;
 });
 recovery.request(f.t,{recovery:'light',resume:f.route});
 await recovery.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.stoneRecovery.stage,'place');
 await recovery.tick(f.t,f.b,f.motor,f.state);assert.equal(placements,2);
 assert.equal(f.cells.get(house.point(f.t.plot,'furnace').toString()),'furnace');
});

test('a missing pick is replaced through the existing recipe path before the mine is resumed',async ctx=>{
 const f=fixture(ctx,{oak_log:2}),tools=require('../controller/tool_recovery');
 recovery.request(f.t,{recovery:'tool',resume:f.route});
 await recovery.tick(f.t,f.b,f.motor,f.state);assert.ok(f.t.wilderness.toolRecovery);
 await tools.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.items.wooden_pickaxe,1);assert.equal(f.items.oak_log,0);
 await recovery.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.wilderness.stoneRoute,f.route);assert.equal(f.t.phase,'night_stone');
});

test('a deep tool return replenishes lighting before spending its final allowed revisit',async ctx=>{
 const f=fixture(ctx,{oak_planks:8,stick:4,oak_log:4,cobblestone:6}),tools=require('../controller/tool_recovery');
 f.cells.set(house.point(f.t.plot,'furnace').toString(),'furnace');
 Object.assign(f.route,{steps:11,resume_count:2});
 recovery.request(f.t,{recovery:'tool',resume:f.route});
 await recovery.tick(f.t,f.b,f.motor,f.state);await tools.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.items.wooden_pickaxe,1);assert.equal(f.t.wilderness.stoneRoute,undefined);
 for(let i=0;i<20&&f.t.wilderness.stoneRecovery;i++)await recovery.tick(f.t,f.b,f.motor,f.state);
 assert.equal(f.items.torch,8);assert.equal(f.items.cobblestone,6);assert.equal(f.t.wilderness.stoneRoute,f.route);
 assert.equal(f.route.resume_count,2,'restocking does not grant an extra revisit');
});

test('a wooden pick cannot satisfy a paused face that requires a stone pickaxe',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,cobblestone:2,oak_log:3});
 recovery.request(f.t,{recovery:'tool',required_tool:'stone_pickaxe',resume:f.route});
 await assert.rejects(recovery.tick(f.t,f.b,f.motor,f.state),/stone pickaxe and three real cobblestone/);
 assert.equal(f.t.wilderness.stoneRoute,undefined);assert.deepEqual(f.crafts,[]);
});

test('lighting without fuel or enough furnace stone ends explicitly instead of creating another hole',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,cobblestone:7,oak_log:3,stick:4});
 recovery.request(f.t,{recovery:'light',resume:f.route});
 await assert.rejects(recovery.tick(f.t,f.b,f.motor,f.state),/eight real cobblestone/);
 assert.equal(f.t.failureCategory,'resource_unavailable');assert.equal(f.t.wilderness.stoneRoute,undefined);
 assert.equal(f.items.cobblestone,7);assert.equal(f.t.wilderness.stoneRecovery.route,f.route);
});

test('survival cover interrupts mine resupply and preserves it for the original lesson',async ctx=>{
 const f=fixture(ctx,{wooden_pickaxe:1,oak_log:3,cobblestone:12});f.t.milestones=['hut'];
 recovery.request(f.t,{recovery:'light',resume:f.route});f.b.health=9;
 await night.interrupt(f.t,f.b,f.motor,f.state);
 assert.equal(f.t.phase,'night_retreat');assert.ok(f.t.wilderness.stoneRecovery);
 assert.equal(f.items.furnace,undefined);assert.equal(f.items.cobblestone,12);
 f.t.phase='night_recover';f.b.health=20;
 await night.interrupt(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'night_stone');
 assert.equal(f.t.wilderness.stoneRecovery.route,f.route);
});

'use strict';

// Modelled material/accounting regressions. Actual acquisition/crafting still
// needs the separate Paper fixture; these tests do not claim native survival.
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const bootstrap=require('../pilot/burrow_bootstrap.cjs');
const burrow=require('../controller/emergency_burrow'),inventory=require('../controller/inventory_sync');
const access=require('../controller/resource_access');
const shelterWork=require('../controller/shelter_work');
const {trackedBurrow}=require('../pilot/life.cjs');

function fixture(ctx,{planks=7,sticks=4,logs=31,axes=1,picks=0}={}){
 let now=100000,pauses=0,checkpoints=0;
 const stock={acacia_planks:planks,stick:sticks,oak_log:logs,wooden_axe:axes,...(picks?{wooden_pickaxe:picks}:{})},cells=new Map(),calls=[];
 const set=(at,name)=>cells.set(at.floored().toString(),name);
 const b={username:'HomeAI01',health:20,food:20,players:{},entities:{},
  entity:{position:new Vec3(.5,65,.5),onGround:true},
  inventory:{items:()=>Object.entries(stock).filter(([,count])=>count>0).map(([name,count])=>({name,count})),slots:[]},
  canDigBlock:()=>true,recipesFor:()=>[{}],heldItem:{name:'wooden_axe',count:1},
  registry:{itemsByName:{crafting_table:{id:1},wooden_pickaxe:{id:2},stick:{id:3}}}};
 b.blockAt=at=>{at=at.floored();const name=cells.get(at.toString())??(at.y>=68?'air':'dirt');
  return {name,position:at,boundingBox:name==='air'?'empty':'block',getProperties:()=>({})};};
 b.world={raycast:(eye,direction,length)=>{
  for(let d=0;d<=length;d+=.02){const block=b.blockAt(eye.plus(direction.scaled(d)));if(block.boundingBox==='block')return block;}
  return null;
 }};
 set(new Vec3(0,65,0),'air');set(new Vec3(0,66,0),'air');
 const s={feet:[0,67,0],cap:[0,67,0],lip:[1,67,0],stage:'hidden',waitReason:'spider 9m above shelter',
  cap_name:'dirt',lip_name:'dirt',resume:'gather'};
 const consume=(name,n)=>{assert.ok((stock[name]||0)>=n,'real modelled recipe stock: '+name);stock[name]-=n;};
 const consumePlanks=n=>{
  assert.ok(Object.entries(stock).filter(([name])=>name.endsWith('_planks')).reduce((total,[,count])=>total+count,0)>=n);
  for(const name of Object.keys(stock).filter(name=>name.endsWith('_planks'))){const amount=Math.min(n,stock[name]);consume(name,amount);n-=amount;if(!n)break;}
 };
 const t={phase:'night_burrow',wilderness:{burrow:s},milestones:[],craft:async(_b,name,times,table)=>{
  calls.push({kind:'craft',name,table:table?.position.toArray()||null});assert.equal(times,1);
  if(name.endsWith('_planks')){consume(name.replace('_planks','_log'),1);stock[name]=(stock[name]||0)+4;}
  else if(name==='crafting_table'){consumePlanks(4);stock.crafting_table=(stock.crafting_table||0)+1;}
  else if(name==='stick'){consumePlanks(2);stock.stick=(stock.stick||0)+4;}
  else if(['wooden_pickaxe','wooden_axe'].includes(name)){
   assert.equal(table?.name,'crafting_table');consumePlanks(3);consume('stick',2);stock[name]=1;
  }else assert.fail('unexpected recipe '+name);
 }};
 const motor={pause(){pauses++;}};
 ctx.mock.method(inventory,'sync',async()=>{});
 ctx.mock.method(inventory,'equip',async(_b,name)=>{assert.ok(stock[name]);b.heldItem={name,count:stock[name]};});
 // Exercise the shared shell checks during excavation and placement.
 ctx.mock.method(access,'dig',async(_b,block,{validate})=>{
  assert.ok(validate());calls.push({kind:'dig',at:block.position.toArray()});set(block.position,'air');return true;
 });
 b.placeBlock=async(support,face)=>{
  const at=support.position.plus(face);assert.ok(stock.crafting_table);consume('crafting_table',1);
  set(at,'crafting_table');calls.push({kind:'place',at:at.toArray()});
 };
 return {b,t,s,stock,calls,set,motor,get now(){return now;},advance(ms){now+=ms;},
  get pauses(){return pauses;},get checkpoints(){return checkpoints;},
  tick:()=>bootstrap.tick(t,b,motor,{now,checkpoint(){checkpoints++;}})};
}

test('a pre-torch resident consumes real modelled wood, installs a safe table and crafts its first pick without granting milestones',async ctx=>{
 const f=fixture(ctx);
 assert.equal(shelterWork.lessonReady(f.t),false);
 assert.equal(burrow.sealed(f.b,f.s),true);
 assert.equal(burrow.walls(f.b,new Vec3(...f.s.feet),f.s),true);
 for(let i=0;i<4;i++){assert.equal(await f.tick(),true);f.advance(1000);}
 assert.equal(f.stock.crafting_table,0);assert.equal(f.stock.wooden_pickaxe,1);
 assert.equal(f.stock.acacia_planks,0);assert.equal(f.stock.stick,2);assert.equal(f.stock.oak_log,31);
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.b.blockAt(new Vec3(...f.s.workspace.floor)).name,'crafting_table');
 assert.equal(burrow.sealed(f.b,f.s),true);assert.equal(burrow.walls(f.b,new Vec3(...f.s.feet),f.s),true);
 assert.deepEqual(f.t.milestones,[]);assert.equal(f.s.resume,'gather');assert.equal(f.s.stage,'hidden');
 assert.equal(await f.tick(),false);assert.equal(f.calls.length,4);
 assert.ok(f.checkpoints>=8);
});

test('a tool-less resident prepares both a real axe and pick in its verified local burrow',async ctx=>{
 const f=fixture(ctx,{planks:10,sticks:4,logs:0,axes:0});
 for(let i=0;i<5;i++){assert.equal(await f.tick(),true);f.advance(1000);}
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.stock.wooden_pickaxe,1);
 assert.equal(f.stock.acacia_planks,0);assert.equal(f.stock.stick,0);
 assert.deepEqual(f.s.pilotBootstrap.outputs,['crafting_table','wooden_axe','wooden_pickaxe']);
 assert.equal(f.calls.filter(c=>c.kind==='place').length,1);
 assert.equal(burrow.sealed(f.b,f.s),true);assert.equal(burrow.walls(f.b,new Vec3(...f.s.feet),f.s),true);
 assert.equal(f.s.stage,'hidden');assert.equal(f.s.resume,'gather');assert.deepEqual(f.t.milestones,[]);
 assert.equal(await f.tick(),false);
});

test('an existing real pick does not prevent making the missing axe at the same remembered workbench',async ctx=>{
 const f=fixture(ctx,{planks:3,sticks:2,logs:0,axes:0,picks:1});
 f.s.workspace={floor:[1,65,0],stationOnly:true,station:'crafting_table',attempts:0};
 f.set(new Vec3(1,65,0),'crafting_table');
 assert.equal(await f.tick(),true);
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.stock.wooden_pickaxe,1);
 assert.equal(f.stock.acacia_planks,0);assert.equal(f.stock.stick,0);
 assert.deepEqual(f.calls.map(c=>c.name),['wooden_axe']);
 assert.deepEqual(f.s.pilotBootstrap.outputs,['wooden_axe']);assert.equal(await f.tick(),false);
});

test('preparing both tools from raw logs respects the eight-action limit and resumes the same table after backoff',async ctx=>{
 const f=fixture(ctx,{planks:0,sticks:0,logs:3,axes:0});
 for(let i=0;i<8;i++){assert.equal(await f.tick(),true);f.advance(1000);}
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.stock.wooden_pickaxe,undefined);
 assert.equal(f.s.pilotBootstrap.actions,8);assert.equal(await f.tick(),false);
 const retry=f.s.pilotBootstrap.retryAt;assert.equal(retry,f.now+60000);
 const saved=trackedBurrow(f.s);f.t.wilderness.burrow={...saved,waitReason:'daylight'};
 f.advance(59999);assert.equal(await f.tick(),false);f.advance(1);assert.equal(await f.tick(),true);
 assert.equal(f.stock.wooden_pickaxe,1);assert.equal(f.stock.oak_log,0);assert.equal(f.stock.oak_planks,0);
 assert.equal(f.stock.stick,0);assert.equal(f.calls.filter(c=>c.kind==='place').length,1);
 assert.equal(f.t.wilderness.burrow.pilotBootstrap.actions,1);
 assert.ok(f.t.wilderness.burrow.pilotBootstrap.outputs.includes('wooden_axe'));
 assert.ok(f.t.wilderness.burrow.pilotBootstrap.outputs.includes('wooden_pickaxe'));
 assert.equal(burrow.sealed(f.b,f.t.wilderness.burrow),true);assert.deepEqual(f.t.milestones,[]);
});

test('bootstrap is subordinate to an already clear daylight exit and every open/climb stage',async ctx=>{
 const f=fixture(ctx);
 f.s.waitReason=null;assert.equal(await f.tick(),false);
 f.s.waitReason='daylight';
 for(const stage of ['open','reclaim','climb','approach']){f.s.stage=stage;assert.equal(await f.tick(),false);}
 assert.deepEqual(f.calls,[]);assert.equal(f.checkpoints,0);
});

test('breached roof, changed shell, airborne footing and unavailable recipes refuse protected work',async ctx=>{
 const f=fixture(ctx);
 f.set(new Vec3(0,67,0),'air');assert.equal(await f.tick(),false);f.set(new Vec3(0,67,0),'dirt');
 f.set(new Vec3(-1,66,0),'water');assert.equal(await f.tick(),false);f.set(new Vec3(-1,66,0),'dirt');
 f.b.entity.onGround=false;assert.equal(await f.tick(),false);f.b.entity.onGround=true;
 delete f.b.recipesFor;assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
});

test('missing real wood never creates stock or opens a pocket',async ctx=>{
 const f=fixture(ctx,{planks:3,logs:0});
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
 assert.equal(f.s.workspace,undefined);assert.equal(f.stock.crafting_table,undefined);
});

test('first table preparation is itself real and bounded when planks must be made',async ctx=>{
 const f=fixture(ctx,{planks:0,logs:1});
 await f.tick();assert.equal(f.stock.oak_log,0);assert.equal(f.stock.oak_planks,4);
 assert.deepEqual(f.t.milestones,[]);assert.equal(f.calls[0].name,'oak_planks');
});

test('unconfirmed native crafting enters backoff instead of granting a pick or retrying each tick',async ctx=>{
 const f=fixture(ctx);f.t.craft=async()=>{};
 assert.equal(await f.tick(),true);
 assert.match(f.s.pilotBootstrap.lastFailure,/not confirmed/);
 assert.equal(f.s.pilotBootstrap.retryAt,f.now+60000);
 assert.equal(await f.tick(),false);assert.equal(f.stock.wooden_pickaxe,undefined);
 assert.deepEqual(f.t.milestones,[]);
});

test('budget expiration defers work and leaves exit state intact',async ctx=>{
 const f=fixture(ctx);f.s.pilotBootstrap={startedAt:f.now-60000,actions:0,retryAt:0,outputs:[]};
 assert.equal(await f.tick(),false);assert.equal(f.s.pilotBootstrap.retryAt,f.now+60000);
 assert.deepEqual(f.calls,[]);assert.equal(f.s.stage,'hidden');
 f.s.waitReason=null;assert.equal(await f.tick(),false);
});

test('eight unsuccessful independent actions cannot run an unbounded work loop',async ctx=>{
 const f=fixture(ctx);f.s.pilotBootstrap={startedAt:f.now,actions:8,retryAt:0};
 assert.equal(await f.tick(),false);assert.equal(f.s.pilotBootstrap.retryAt,f.now+60000);
 assert.deepEqual(f.calls,[]);
});

test('intent survives a restart after excavation and after server placement without duplicating the table',async ctx=>{
 const f=fixture(ctx);await f.tick();await f.tick();
 const persisted=trackedBurrow(f.s);
 assert.equal(persisted.workspace.stationOnly,true);assert.equal(persisted.pilotBootstrap.actions,2);
 f.t.wilderness.burrow={...persisted,waitReason:'spider'};
 await f.tick();
 const installed=f.t.wilderness.burrow;
 assert.equal(f.b.blockAt(new Vec3(...installed.workspace.floor)).name,'crafting_table');
 const restored=trackedBurrow(installed);f.t.wilderness.burrow={...restored,waitReason:'spider'};
 await f.tick();assert.equal(f.stock.wooden_pickaxe,1);
 assert.equal(f.calls.filter(c=>c.kind==='place').length,1);
 assert.equal(f.calls.filter(c=>c.kind==='craft'&&c.name==='crafting_table').length,1);
});

test('a generation interruption is propagated rather than checkpointed as an ordinary retry',async ctx=>{
 const f=fixture(ctx),error=Object.assign(Error('life changed'),{code:'PILOT_LIFE_CHANGED'});
 f.t.craft=async()=>{throw error;};
 await assert.rejects(f.tick(),{code:'PILOT_LIFE_CHANGED'});
 assert.equal(f.s.pilotBootstrap.retryAt,0);
});

test('a changed or flooded remembered workspace is refused without digging another cell',async ctx=>{
 const f=fixture(ctx);await f.tick();await f.tick();
 const at=new Vec3(...f.s.workspace.floor);f.set(at.offset(0,1,0),'water');
 const before=f.calls.length;assert.equal(await f.tick(),false);assert.equal(f.calls.length,before);
 assert.equal(f.stock.wooden_pickaxe,undefined);assert.equal(f.s.stage,'hidden');
});

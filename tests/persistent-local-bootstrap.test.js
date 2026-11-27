'use strict';

// These model native recipe consumption and loaded-block sensing. They do not
// establish autonomous acquisition; the private Paper fixture checks execution.
const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3');
const bootstrap=require('../pilot/local_bootstrap.cjs');
const inventory=require('../controller/inventory_sync');
const space=require('../controller/resource_space');

function fixture(ctx,{logs=3,planks=0,sticks=0,table=0,axe=0}={}){
 let now=100000,checkpoints=0,pauses=0;
 const stock={oak_log:logs,oak_planks:planks,stick:sticks,crafting_table:table,wooden_axe:axe},cells=new Map(),calls=[];
 const set=(q,name,props={})=>cells.set(q.floored().toString(),{name,props});
 const b={username:'HomeAI01',health:20,food:20,time:{timeOfDay:6000},entities:{},players:{},
  entity:{id:1,position:new Vec3(.5,64,.5),velocity:new Vec3(0,0,0),onGround:true},
  inventory:{slots:[],items:()=>Object.entries(stock).filter(([,count])=>count>0).map(([name,count])=>({name,count}))},
  registry:{entitiesByName:{}},recipesFor:()=>[{}]};
 b.blockAt=q=>{q=q.floored();const v=cells.get(q.toString())||{name:q.y<64?'stone':'air',props:{}};
  return {name:v.name,position:q,boundingBox:['air','water','lava'].includes(v.name)?'empty':'block',getProperties:()=>v.props};};
 b.world={raycast:(eye,direction,length)=>{
  for(let d=0;d<=length;d+=.01){const at=eye.plus(direction.scaled(d)),block=b.blockAt(at);if(block?.boundingBox==='block')return {...block,intersect:at};}
  return null;
 }};
 const consume=(name,n)=>{assert.ok((stock[name]||0)>=n,'modelled real stock: '+name);stock[name]-=n;};
 const t={phase:'night_bootstrap',plot:{x:30,y:64,z:30},campPlots:[],wilderness:{},milestones:[],
  async craft(_b,name,times,station){
   assert.equal(times,1);calls.push({kind:'craft',name,station:station?.position.toArray()||null});
   if(name==='oak_planks'){consume('oak_log',1);stock.oak_planks+=4;}
   else if(name==='crafting_table'){consume('oak_planks',4);stock.crafting_table++;}
   else if(name==='stick'){consume('oak_planks',2);stock.stick+=4;}
   else if(name==='wooden_axe'){assert.equal(station?.name,'crafting_table');consume('oak_planks',3);consume('stick',2);stock.wooden_axe++;}
   else assert.fail('unexpected recipe '+name);
  },
  async place(_b,q,name,validate){
   assert.equal(name,'crafting_table');assert.ok(validate());consume('crafting_table',1);set(q,name);calls.push({kind:'place',position:q.toArray()});
  },
  async walk(){assert.fail('local preparation must never walk to the distant home');}};
 const state={run:'pilot-native-test',world:{bounds:[-64,64,-64,64],first_night:{id:3,hostiles:true}}};
 const motor={pause(){pauses++;}};
 ctx.mock.method(inventory,'sync',async()=>{});
 return {b,t,state,motor,stock,cells,calls,set,get now(){return now;},advance(ms){now+=ms;},
  get checkpoints(){return checkpoints;},get pauses(){return pauses;},
  tick:()=>bootstrap.tick(t,b,motor,state,{now,checkpoint(){checkpoints++;}})};
}

test('three real modelled logs produce a nearby bench and usable axe without visiting the unbuilt home',async ctx=>{
 const f=fixture(ctx);assert.equal(bootstrap.ready(f.t,f.b,f.state),true);
 for(let i=0;i<7;i++){assert.equal(await f.tick(),true);f.advance(1000);}
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.stock.oak_log,0);assert.equal(f.stock.oak_planks,3);assert.equal(f.stock.stick,2);
 assert.equal(f.stock.crafting_table,0);assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.bootstrap,true);
 const r=f.t.wilderness.pilotWorkbench;assert.equal(r.owner,f.b.username);assert.equal(r.run,f.state.run);
 assert.equal(r.actions,7);assert.deepEqual(r.outputs,['oak_planks','crafting_table','stick','wooden_axe']);
 assert.equal(f.b.blockAt(new Vec3(...r.position)).name,'crafting_table');assert.equal(r.completedAt,f.now-1000);
 assert.equal(f.calls.filter(c=>c.kind==='place').length,1);assert.deepEqual(f.t.milestones,[]);
 assert.deepEqual(f.t.plot,{x:30,y:64,z:30});assert.equal(await f.tick(),false);
});

test('a loaded visible existing workbench is reused with only the real axe ingredients',async ctx=>{
 const f=fixture(ctx,{logs:0,planks:3,sticks:2});f.set(new Vec3(2,64,0),'crafting_table');
 assert.equal(await f.tick(),true);assert.equal(f.stock.wooden_axe,1);
 assert.deepEqual(f.calls.map(c=>c.name),['wooden_axe']);assert.equal(f.stock.oak_planks,0);assert.equal(f.stock.stick,0);
 assert.deepEqual(f.t.wilderness.pilotWorkbench.position,[2,64,0]);assert.equal(f.t.wilderness.pilotWorkbench.placed,false);
});

test('interruption after placement revalidates the same real bench without duplicate construction',async ctx=>{
 const f=fixture(ctx);
 for(let i=0;i<5;i++){await f.tick();f.advance(1000);}
 assert.equal(f.calls.filter(c=>c.kind==='place').length,1);
 const saved=JSON.parse(JSON.stringify(f.t.wilderness.pilotWorkbench));
 f.t.wilderness={pilotWorkbench:saved};await f.tick();f.advance(1000);await f.tick();
 assert.equal(f.stock.wooden_axe,1);assert.equal(f.calls.filter(c=>c.kind==='place').length,1);
 assert.equal(f.t.wilderness.pilotWorkbench.actions,7);
});

test('night, unknown time, visible monsters, active burrows and airborne or wet footing forbid local crafting',async ctx=>{
 const f=fixture(ctx);
 for(const time of [12000,18000,undefined]){f.b.time.timeOfDay=time;assert.equal(await f.tick(),false);}
 f.b.time.timeOfDay=6000;
 for(const name of ['zombie','skeleton','creeper']){
  f.b.entities={9:{id:9,name,position:new Vec3(6.5,64,.5),height:1.8,isValid:true,metadata:[]}};
  assert.equal(await f.tick(),false);
 }
 f.b.entities={};f.t.wilderness.burrow={stage:'hidden'};assert.equal(await f.tick(),false);delete f.t.wilderness.burrow;
 f.b.entity.onGround=false;assert.equal(await f.tick(),false);f.b.entity.onGround=true;
 f.b.entity.isInWater=true;assert.equal(await f.tick(),false);f.b.entity.isInWater=false;
 f.set(new Vec3(1,64,0),'water');assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
});

test('missing wood, unavailable local support and unknown terrain cannot create a bench or fake useful progress',async ctx=>{
 const f=fixture(ctx,{logs:0,planks:3});assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
 f.stock.oak_log=3;
 for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)if(x||z)f.set(new Vec3(x,63,z),'air');
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);assert.match(f.t.wilderness.pilotWorkbench.lastFailure,/No visible/);
 f.advance(60000);const blockAt=f.b.blockAt;f.b.blockAt=q=>q.x===1?null:blockAt(q);
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);assert.deepEqual(f.t.milestones,[]);
});

test('a foreign plot and nearby players retain their space instead of becoming a local work site',async ctx=>{
 const f=fixture(ctx);f.t.campPlots=[{x:0,y:64,z:0}];
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
 f.t.campPlots=[];f.advance(60000);
 f.b.players={};let id=2;
 for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)f.b.players['Other'+id]={username:'Other'+id,entity:{id:id++,position:new Vec3(x+.5,64,z+.5)}};
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);
 const q=new Vec3(1,64,0);assert.equal(space.clearOfPlayers(f.b,q.offset(.5,.5,.5)),false);
});

test('moving footing settles before any recipe or native placement',async ctx=>{
 const f=fixture(ctx);f.b.entity.velocity.x=.1;
 assert.equal(await f.tick(),true);assert.equal(f.pauses,1);assert.deepEqual(f.calls,[]);
 assert.equal(f.t.wilderness.pilotWorkbench.actions,0);
});

test('an unconfirmed native recipe backs off and a generation change propagates without being hidden',async ctx=>{
 const f=fixture(ctx);f.t.craft=async()=>{};
 assert.equal(await f.tick(),true);assert.match(f.t.wilderness.pilotWorkbench.lastFailure,/not confirmed/);
 assert.equal(f.t.wilderness.pilotWorkbench.retryAt,f.now+60000);assert.equal(await f.tick(),false);
 f.advance(60000);f.t.craft=async()=>{throw Object.assign(Error('life changed'),{code:'PILOT_LIFE_CHANGED'});};
 await assert.rejects(f.tick(),{code:'PILOT_LIFE_CHANGED'});assert.equal(f.stock.wooden_axe,0);
});

test('a changed or flooded remembered workbench is never used as a trusted crafting claim',async ctx=>{
 const f=fixture(ctx,{logs:0,planks:3,sticks:2});const q=new Vec3(2,64,0);
 f.set(q,'crafting_table',{waterlogged:true});
 f.t.wilderness.pilotWorkbench={owner:f.b.username,run:f.state.run,position:q.toArray(),startedAt:f.now,actions:0,retryAt:0,outputs:[]};
 assert.equal(await f.tick(),false);assert.deepEqual(f.calls,[]);assert.equal(f.stock.wooden_axe,0);
});

test('work limits and existing usable axes bound retries without awarding survival or construction milestones',async ctx=>{
 const f=fixture(ctx);f.t.wilderness.pilotWorkbench={owner:f.b.username,run:f.state.run,position:null,startedAt:f.now,actions:8,retryAt:0,outputs:[]};
 assert.equal(await f.tick(),false);assert.equal(f.t.wilderness.pilotWorkbench.retryAt,f.now+60000);
 assert.deepEqual(f.calls,[]);f.advance(60000);f.stock.wooden_axe=1;
 assert.equal(await f.tick(),false);assert.deepEqual(f.t.milestones,[]);
});

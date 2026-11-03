const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const recovery=require('../controller/tool_recovery'),inventory=require('../controller/inventory_sync');
function fixture(ctx,items={}){
 const b={entity:{position:new Vec3(.5,64.1,.5)},inventory:{items:()=>Object.entries(items).filter(([,count])=>count).map(([name,count])=>({name,count}))},blockAt:()=>({name:'crafting_table'})};
 const t={phase:'night_stone',plot:{x:0,y:64,z:0},wilderness:{},navigator:{},path:[1],craft:async(_b,name)=>{
  if(name.endsWith('_planks')){assert.ok(items.oak_log);items.oak_log--;items[name]=(items[name]||0)+4;}
  else if(name==='stick'){assert.ok(items.oak_planks>=2);items.oak_planks-=2;items.stick=(items.stick||0)+4;}
  else{assert.ok(items.stick>=2);assert.ok(items.oak_planks>=3);items.stick-=2;items.oak_planks-=3;items[name]=1;}
 },walk:async(_b,_m,g)=>{b.entity.position=new Vec3(...g);return true;}};
 ctx.mock.method(inventory,'sync',async()=>{});ctx.mock.method(inventory,'equip',async(_b,name)=>{assert.ok(items[name]);b.heldItem={name};});
 return {b,t,items,motor:{pause(){}},state:{world:{}}};
}
test('a carried upgrade satisfies a wooden tool request but a wooden pick cannot mine iron',()=>{
 const b={inventory:{items:()=>[{name:'stone_pickaxe',count:1},{name:'wooden_axe',count:1}]}};
 assert.equal(recovery.choose(b,'wooden_pickaxe'),'stone_pickaxe');assert.equal(recovery.choose(b,'wooden_axe'),'wooden_axe');
 b.inventory.items=()=>[{name:'wooden_pickaxe',count:1},{name:'golden_pickaxe',count:1}];assert.equal(recovery.choose(b,'stone_pickaxe'),null);
});
test('replacement uses real logs and recipes then resumes the interrupted task',async ctx=>{
 const f=fixture(ctx,{oak_log:2});recovery.request(f.t,'wooden_pickaxe');
 await recovery.tick(f.t,f.b,f.motor,f.state);assert.equal(f.items.wooden_pickaxe,1);assert.equal(f.items.oak_log,0);
 assert.equal(f.b.heldItem.name,'wooden_pickaxe');assert.equal(f.t.phase,'night_stone');assert.equal(f.t.wilderness.toolRecovery,undefined);assert.deepEqual(f.t.path,[]);
});
test('missing supplies use normal gathering then return to the original lesson without supply-craft detours',async ctx=>{
 const f=fixture(ctx);f.t.phase='night_wool';recovery.request(f.t,'wooden_axe');
 assert.equal(await recovery.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.t.phase,'gather');assert.equal(f.t.wilderness.fuelTrip,true);
 recovery.request(f.t,'wooden_pickaxe');assert.equal(f.t.wilderness.toolRecovery.resume,'night_wool','nested requests cannot overwrite the interrupted lesson');
 f.items.oak_log=2;await recovery.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'night_wool');assert.equal(f.items.wooden_axe,1);assert.equal(f.t.wilderness.fuelTrip,false);
});
test('replacement exits the recorded mine before routing home and does not invent tools',async ctx=>{
 const f=fixture(ctx,{oak_log:2});f.t.wilderness.mine={stage:'descend',path:[[5,63,0],[6,62,0]]};recovery.request(f.t,'wooden_pickaxe');
 ctx.mock.method(require('../controller/staircase_mining'),'tick',async t=>{assert.equal(t.wilderness.mine.stage,'exit');assert.equal(t.wilderness.mine.exitIndex,1);t.wilderness.mine.stage='done';});
 await recovery.tick(f.t,f.b,f.motor,f.state);assert.equal(f.items.wooden_pickaxe,undefined);
 await recovery.tick(f.t,f.b,f.motor,f.state);assert.equal(f.items.wooden_pickaxe,1);
});
test('a refused server recipe never becomes a claimed replacement or lesson success',async ctx=>{
 const f=fixture(ctx,{oak_planks:3,stick:2});f.t.craft=async()=>{};recovery.request(f.t,'wooden_pickaxe');
 await assert.rejects(recovery.tick(f.t,f.b,f.motor,f.state),/not received from the server/);assert.ok(f.t.wilderness.toolRecovery);assert.equal(f.items.wooden_pickaxe,undefined);
});
test('shelter takes priority over replacement and daylight resumption clears stale travel plans',async ctx=>{
 const night=require('../controller/first_night'),f=fixture(ctx);Object.assign(f.b,{health:9,food:20,entities:{},time:{timeOfDay:6000}});f.t.milestones=['hut'];night.init(f.t,{});recovery.request(f.t,'wooden_pickaxe');
 await night.interrupt(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'night_retreat');assert.ok(f.t.wilderness.toolRecovery);
 f.t.phase='night_recover';f.b.health=20;f.t.wilderness.searchGoal=[80,64,80];f.t.wilderness.leaving=true;
 await night.interrupt(f.t,f.b,f.motor,f.state);assert.equal(f.t.phase,'night_stone');assert.equal(f.t.wilderness.searchGoal,null);assert.equal(f.t.wilderness.leaving,false);assert.ok(f.t.wilderness.toolRecovery);
});

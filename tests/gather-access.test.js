const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const access=require('../controller/resource_access'),{HutTeacher}=require('../controller/hut_teacher');
function fixture(){
 const blocks=new Map(),b={username:'gather-regression',players:{},entities:{},health:20,food:20,
 entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,yaw:0,pitch:0,eyeHeight:1.62},inventory:{items:()=>[]},
 blockAt(p){p=p.floored();const name=blocks.get(p.toString())||(p.y<64?'stone':'air');return {position:p,name,boundingBox:name==='air'?'empty':'block'};},
 canDigBlock:()=>true,look:async()=>{},clearControlStates(){}};
 b.set=(x,y,z,n)=>blocks.set(new Vec3(x,y,z).toString(),n);return b;
}
test('Gather cuts reachable logs before moving to an old approach or collecting loose wood',async()=>{
 // Load the expensive registry before starting controller scan/report timers.
 // Otherwise parallel test load can expire them halfway through this fixture.
 const registry=require('prismarine-registry')('1.21.4'),Item=require('prismarine-item')(registry);
 const b=fixture(),p=b.entity.position,now=Date.now(),t=new HutTeacher(),target=new Vec3(2,65,0),goal=[1.5,65.1,.5];
 b.set(1,64,0,'stone');b.set(2,65,0,'oak_log');b.world={raycast:()=>b.blockAt(target)};
 Object.assign(t,{run:'fixture',phase:'gather',started:now,lastProgress:now,lastReport:now,last:p.clone(),anchor:p.clone(),travelled:0,
  stall:new (require('../controller/world_stall').WorldStall)(),timing:new (require('../controller/world_timing').WorldTiming)(now),
  ignoredTrees:new Map(),ignoredDrops:new Map(),inventoryAt:now,resourceAt:now,resources:[target],tree:'2,0',treeApproach:goal,
  path:[],milestones:[],harvested:0,plot:null,campPlots:[],settle:0,resourceAccess:{}});
 let walked=0,mined=0;t.walk=async(_b,_m,g)=>{assert.deepEqual(g,goal);walked++;};t.harvest=async()=>{mined++;};
 const state={run:'fixture',world:{bounds:[-20,20,-20,20],mission:'hut'}},motor={pause(){}};
 await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(walked,0);assert.equal(mined,1);
 b.entity.position=new Vec3(1.5,65,.5);await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(mined,2);
 b.registry=registry;const index=b.registry.entitiesByName.item.metadataKeys.indexOf('item');
 b.entities.drop={id:12,name:'item',position:new Vec3(1.8,65.2,.5),metadata:{[index]:Item.toNotch(new Item(b.registry.itemsByName.oak_log.id,1))}};
 let collected=0;t.collectWood=async()=>{collected++;};
 await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(collected,0);assert.equal(mined,3,'reachable logs retain the work stance');
 b.set(2,65,0,'air');await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(collected,1,'drops are collected once reachable logs are gone');
});
test('clearing permits adjacent shallow soil but protects supporting footprints, fluids, gravity and homes',()=>{
 const b=fixture();b.set(1,63,0,'dirt');const q=b.blockAt(new Vec3(1,63,0));assert.equal(access.safeClear(b,q),true);
 b.entity.position.x=.8;assert.equal(access.safeClear(b,q),false);b.entity.position.x=.5;
 b.set(1,64,0,'sand');assert.equal(access.safeClear(b,q),false);b.set(1,64,0,'air');
 b.set(2,63,0,'water');assert.equal(access.safeClear(b,q),false);b.set(2,63,0,'stone');
 assert.equal(access.safeClear(b,q,{plots:[{x:1,y:64,z:0}]}),false);
 b.players.other={username:'other',entity:{id:2,position:new Vec3(1.5,64,.5)}};assert.equal(access.safeClear(b,q),false);
});
test('stone scanning includes shallow soft cover but rejects deep dirt and solid rock',()=>{
 const b=fixture(),q=new Vec3(3,65,0),{shallowFace}=require('../controller/resource_scan');
 for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]])b.set(q.x+x,q.y+y,q.z+z,'stone');
 b.set(2,65,0,'dirt');b.set(1,65,0,'dirt');assert.equal(shallowFace(b,q),true);
 b.set(0,65,0,'dirt');b.set(-1,65,0,'dirt');assert.equal(shallowFace(b,q),false);
 b.set(2,65,0,'stone');assert.equal(shallowFace(b,q),false);
});
test('an empty search selects a meaningful journey, rather than another adjacent scan point',async()=>{
 const b=fixture(),{Exploration,release}=require('../controller/exploration'),e=new Exploration();
 const g=await e.choose(b,{bounds:[-40,40,-40,40],run:'gather-search'},()=>64,[],'wood');
 assert.ok(g);assert.ok(Math.hypot(g[0]-.5,g[2]-.5)>=8);release(b.username);
});
test('coal and iron lessons invoke safe cover removal before declaring the ore face blocked',async()=>{
 const b=fixture();b.world={raycast:()=>b.blockAt(new Vec3(1,65,0))};b.set(1,65,0,'dirt');
 for(const [phase,name] of [['survival_coal','coal_ore'],['survival_iron','iron_ore']]){
  b.set(2,65,0,name);let cleared=false;
  const t={phase,survival:{station:{coal:[[2,65,0]],ores:[[2,65,0]],iron_target:4}},
   accessResource:async(_b,_m,p)=>{assert.deepEqual([p.x,p.y,p.z],[2,65,0]);cleared=true;return {handled:true};},walk:async()=>{throw Error('Should clear reachable cover before walking');}};
  await require('../controller/survival').tick(t,b,{}, {run:'fixture',world:{}},null,null,null);assert.equal(cleared,true);
 }
});
test('natural stone discovery retains covered candidates for the clearing skill',async()=>{
 const b=fixture();b.set(1,65,0,'dirt');b.set(2,65,0,'stone');b.world={raycast:()=>b.blockAt(new Vec3(1,65,0))};
 b.findBlocks=()=>[new Vec3(2,65,0)];let cleared=false;
 const t={phase:'night_stone',plot:{x:-10,y:64,z:-10},milestones:[],accessResource:async(_b,_m,p)=>{assert.equal(p.x,2);cleared=true;return {handled:true};}};
 const night=require('../controller/first_night');night.init(t,{});
 await night.tick(t,b,{}, {run:'fixture',world:{bounds:[-30,30,-30,30]}},null,null,null,()=>64);assert.equal(cleared,true);
});

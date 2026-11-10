const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{WorldStall}=require('../controller/world_stall');
function fixture(items=[]){
 const now=Date.now(),b={username:'build-supply-test',players:{},entities:{},health:20,food:20,entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>items},blockAt(p){return {position:p.floored(),name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty'};}};
 const t=new HutTeacher();Object.assign(t,{run:'test',phase:'torch_craft',started:now,lastProgress:now,lastReport:now,last:b.entity.position.clone(),anchor:b.entity.position.clone(),travelled:0,stall:new WorldStall(),timing:new WorldTiming(now),milestones:[],plot:{x:0,y:64,z:0},settle:0});
 return {b,t,state:{run:'test',world:{mission:'hut',bounds:[-20,20,-20,20]}}};
}
test('torch handles convert carried logs before crafting sticks',async()=>{
 const items=[{name:'birch_log',count:1},{name:'charcoal',count:1}],{b,t,state}=fixture(items),calls=[];
 t.craft=async(_b,name)=>{calls.push(name);if(name==='birch_planks')items.splice(0,1,{name,count:4});if(name==='stick')items.push({name,count:4});if(name==='torch')items.push({name,count:4});};
 await t.tick(b,{pause(){}},state,async()=>({}),null,{});
 assert.deepEqual(calls,['birch_planks','stick','torch']);assert.equal(t.phase,'light_inside');assert.equal(t.error,undefined);
});
test('missing torch wood starts a real fuel trip instead of a doomed stick recipe',async()=>{
 const {b,t,state}=fixture([{name:'charcoal',count:1}]);t.wilderness={memory:{observe(){}}};let crafted=false;t.craft=async()=>{crafted=true;};
 await t.tick(b,{pause(){}},state,async()=>({}),null,{});
 assert.equal(crafted,false);assert.equal(t.phase,'gather');assert.equal(t.wilderness.fuelTrip,true);assert.equal(t.supplyRun,true);
});

test('fuel gathering ignores spare planks across repeated ticks and returns with unconverted logs',async()=>{
 const items=[{name:'oak_planks',count:64}],{b,t,state}=fixture(items),night=require('../controller/first_night'),original=night.explore;
 Object.assign(t,{phase:'gather',supplyRun:true,inventoryAt:Date.now(),resourceAt:Date.now(),resources:[],ignoredTrees:new Map(),ignoredDrops:new Map(),treeRetry:Date.now()+60000});
 t.wilderness={bootstrap:true,fuelTrip:true,memory:{observe(){}}};let searches=0;
 night.explore=async()=>{searches++;t.message='Searching for wood';};
 try{
  for(const logs of [0,1,3]){
   items.splice(1,items.length,...(logs?[{name:'birch_log',count:logs}]:[]));
   await t.tick(b,{pause(){}},state,async()=>({}),null,{});
   assert.equal(t.phase,'gather');assert.equal(t.error,undefined);assert.equal(t.woodReady(b),false);assert.match(t.message,new RegExp(`Fuel logs ${logs} / 4`));
  }
  assert.equal(searches,3);
  items.push({name:'spruce_log',count:1});
  await t.tick(b,{pause(){}},state,async()=>({}),null,{});
  assert.equal(t.phase,'stone_return');assert.equal(t.wilderness.fuelTrip,false);
  assert.equal(items.filter(i=>i.name.endsWith('_log')).reduce((n,i)=>n+i.count,0),4);
 }finally{night.explore=original;}
});

test('elevated fuel harvesting continues despite a full stack of spare planks',async()=>{
 const {b,t,state}=fixture([{name:'oak_planks',count:64},{name:'birch_log',count:3}]);
 t.wilderness={fuelTrip:true};t.supplyRun=true;t.phase='gather';
 b.entity.position=new Vec3(.5,65.1,.5);t.resourceAccess={tree:[1,0],column:[{position:new Vec3(0,64,0)}]};
 const previous=b.blockAt;b.blockAt=p=>p.equals(new Vec3(1,66,0))?{name:'birch_log',position:p,boundingBox:'block'}:previous(p);
 b.canDigBlock=()=>true;b.world={raycast:()=>({position:new Vec3(1,66,0)})};let mined;
 t.harvest=async(_b,_motor,p)=>{mined=p;};
 await t.workElevated(b,{pause(){}},state,async()=>({}),null,{});
 assert.deepEqual(mined,new Vec3(1,66,0));assert.notEqual(t.resourceAccess.descending,true);
});

test('ordinary settlement supplies still accept planks and log equivalents',()=>{
 const items=[{name:'oak_planks',count:24}],{b,t}=fixture(items);t.supplyRun=true;
 assert.equal(t.woodReady(b),false);items.push({name:'birch_log',count:1});assert.equal(t.woodReady(b),true);
});
test('wall retries choose distinct reachable stances with a bounded retry count',()=>{
 const {b,t}=fixture(),retry=require('../controller/build_approach').retry,q={x:3,y:64,z:0},bounds=[-20,20,-20,20],seen=new Set([b.entity.position.floored().toString()]);
 let attempts=0;
 while(retry(t,b,q,bounds)){
  const p=new Vec3(...t.buildApproach),key=p.floored().toString();assert.equal(seen.has(key),false);seen.add(key);attempts++;assert.ok(attempts<=7);b.entity.position=p;
 }
 assert.ok(attempts>2,'use more than the three central positions before giving up');
});

test('wall retries reject unsupported and occupied interior stances',()=>{
 const {b,t}=fixture(),retry=require('../controller/build_approach').retry,q={x:3,y:64,z:0};
 b.blockAt=p=>({name:'air',boundingBox:'empty',position:p});assert.equal(retry(t,b,q,[-20,20,-20,20]),false);
 const f=fixture();f.b.players.other={username:'other',entity:{id:2,position:new Vec3(.5,64,.5)}};assert.equal(retry(f.t,f.b,q,[-20,20,-20,20]),true);assert.ok(new Vec3(...f.t.buildApproach).distanceTo(f.b.players.other.entity.position)>=2);
});


test('refused corner walls can be retried from the closer inner ring',()=>{
 const {b,t}=fixture(),q={x:3,y:64,z:3};t.plot={x:0,y:64,z:0};
 assert.equal(require('../controller/build_approach').retry(t,b,q,[-20,20,-20,20]),true);
 assert.deepEqual(t.buildApproach,[2.5,64.1,2.5]);
});

test('refused placements prefer a visible support over a closer occluded stance',()=>{
 const {b,t}=fixture(),q={x:3,y:64,z:0},retry=require('../controller/build_approach').retry;
 b.world={raycast(eye){return eye.x<2?b.blockAt(new Vec3(3,63,0)):null;}};
 assert.equal(retry(t,b,q,[-20,20,-20,20]),true);assert.ok(t.buildApproach[0]<2);
 assert.ok(require('../controller/placement_reference').references(b,q,{standing:new Vec3(...t.buildApproach),visibleOnly:true}).length);
 // An overhead-only placement can still use the existing bounded assist.
 t.buildAttempts=new Map();b.world.raycast=()=>null;
 assert.equal(retry(t,b,q,[-20,20,-20,20]),true);
});

test('construction approach settles before spending a placement retry, then resumes the same unfinished block',async()=>{
 const {b,t,state}=fixture([{name:'oak_planks',count:64}]),house=require('../controller/house'),cells=new Map();
 for(const q of house.blueprint(t.plot))cells.set(new Vec3(q.x,q.y,q.z).toString(),q.table?'crafting_table':'oak_planks');
 const q=house.blueprint(t.plot).find(q=>!q.table&&q.y===64&&q.z===0);cells.delete(new Vec3(q.x,q.y,q.z).toString());
 const base=b.blockAt;b.blockAt=p=>{const name=cells.get(p.floored().toString());return name?{...base(p),name,boundingBox:'block'}:base(p);};
 t.phase='build';t.requiredWood=()=>0;t.buildApproach=[.5,64.1,.5];t.walk=async()=>true;t.buildAttempts=new Map();
 const progress=t.lastProgress;let placed=0,paused=0;
 t.place=async(_b,target)=>{assert.equal(b.entity.onGround,true);assert.ok(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<=.025);placed++;cells.set(new Vec3(target.x,target.y,target.z).toString(),'oak_planks');};
 const motor={pause(){paused++;}};
 b.entity.velocity=new Vec3(.11,0,.04);await t.tick(b,motor,state,async()=>({}),null,{});
 assert.equal(t.phase,'build');assert.equal(placed,0);assert.equal(t.buildAttempts.size,0);assert.equal(t.lastProgress,progress);assert.match(t.message,/Settling/);
 b.entity.velocity=new Vec3(0,0,0);b.entity.onGround=false;await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(placed,0);
 b.entity.onGround=true;await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(placed,1);assert.ok(paused>=3);assert.equal(t.phase,'build');assert.equal(t.error,undefined);
 await t.tick(b,motor,state,async()=>({}),null,{});assert.equal(t.phase,'door');assert.equal(placed,1);
});

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
test('wall retries choose distinct reachable stances and stop after three positions',()=>{
 const {b,t}=fixture(),retry=require('../controller/build_approach').retry,q={x:3,y:64,z:0},bounds=[-20,20,-20,20];
 assert.equal(retry(t,b,q,bounds),true);const first=t.buildApproach.slice();assert.notDeepEqual(first,[.5,64.1,.5]);
 b.entity.position=new Vec3(...first);assert.equal(retry(t,b,q,bounds),true);assert.notDeepEqual(t.buildApproach,first);
 b.entity.position=new Vec3(...t.buildApproach);assert.equal(retry(t,b,q,bounds),false);
});
test('wall retries reject unsupported and occupied interior stances',()=>{
 const {b,t}=fixture(),retry=require('../controller/build_approach').retry,q={x:3,y:64,z:0};
 b.blockAt=p=>({name:'air',boundingBox:'empty',position:p});assert.equal(retry(t,b,q,[-20,20,-20,20]),false);
 const f=fixture();f.b.players.other={username:'other',entity:{id:2,position:new Vec3(.5,64,.5)}};assert.equal(retry(f.t,f.b,q,[-20,20,-20,20]),false);
});

const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const body=require('../controller/resource_body'),access=require('../controller/resource_access');
function fixture(){
 const map=new Map(),b={username:'body-test',players:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,eyeHeight:1.62},inventory:{items:()=>[]},
  blockAt(p){p=p.floored();const name=map.get(p.toString())||(p.y<64?'stone':'air');return {position:p,name,boundingBox:name==='air'?'empty':'block'};}};
 b.set=(x,y,z,n)=>map.set(new Vec3(x,y,z).toString(),n);return b;
}
const opts={bounds:[-4,8,-4,5]};
test('a bot touching a leaf wall can clear it while its actual supporting ground stays protected',()=>{
 const b=fixture();b.entity.position.x=.7;b.set(1,64,0,'oak_leaves');b.set(1,63,0,'dirt');
 assert.equal(access.safeClear(b,b.blockAt(new Vec3(1,64,0))),true);
 assert.equal(access.safeClear(b,b.blockAt(new Vec3(1,63,0))),false);
});
function wall(b,name){for(let z=-4;z<5;z++)for(let y=64;y<=65;y++)b.set(2,y,z,name);}
test('body route sees feet-level leaves below a clear eye ray and plans their removal without editing terrain',()=>{
 const b=fixture();wall(b,'oak_leaves');b.set(2,65,0,'air');const log=new Vec3(4,66,0);b.set(4,66,0,'oak_log');
 assert.equal(access.obstruction(b,log),null);
 const plan=body.plan(b,[3.5,64.1,.5],opts);assert.ok(plan);assert.ok(plan.blocks.some(q=>q.position.equals(new Vec3(2,64,0))));
 assert.equal(b.blockAt(new Vec3(2,64,0)).name,'oak_leaves');assert.ok(plan.approach[0]<2);
});
test('body access accounts for feet and head, permits safe soil, and refuses hard walls, hazards and protected plots',()=>{
 const b=fixture();wall(b,'oak_leaves');let plan=body.plan(b,[3.5,64.1,.5],opts);assert.equal(plan.blocks.length,2);
 wall(b,'dirt');plan=body.plan(b,[3.5,64.1,.5],opts);assert.ok(plan?.blocks.length);
 wall(b,'stone');assert.equal(body.plan(b,[3.5,64.1,.5],opts),null);
 wall(b,'oak_leaves');assert.equal(body.plan(b,[3.5,64.1,.5],{...opts,plots:[{x:2,y:64,z:0}]}),null);
 for(let z=-4;z<5;z++)b.set(2,63,z,'water');assert.equal(body.plan(b,[3.5,64.1,.5],opts),null);
});
test('body clearing respects its task budget before issuing dig commands',async()=>{
 const b=fixture();b.set(1,64,0,'oak_leaves');
 assert.equal(await body.clear(b,{},b.blockAt(new Vec3(1,64,0)),{state:{bodyKey:'drop:1',bodyCleared:body.LIMIT},key:'drop:1'}),false);
});

test('a player replacement block is not dug after aiming at an old leaf position',async()=>{
 const b=fixture(),q=new Vec3(1,65,0);b.set(1,65,0,'oak_leaves');b.entity.yaw=0;b.entity.pitch=0;
 b.world={raycast:()=>b.blockAt(q)};b.canDigBlock=()=>true;b.dig=async()=>{throw Error('Replacement must not be mined');};
 b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;b.set(1,65,0,'oak_planks');};
 assert.equal(await body.clear(b,{pause(){},lockLook(){}},b.blockAt(q),{state:{}}),false);
});
test('wood collection plans at the drop elevation rather than the bot elevation',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),b=fixture();b.set(2,64,0,'stone');
 const t=new HutTeacher();Object.assign(t,{plot:null,campPlots:[],resourceAccess:{},ignoredDrops:new Map()});
 b.world={raycast:()=>null};const goals=[];t.walk=async(_b,_m,g)=>{goals.push(g);};
 await t.collectWood(b,{pause(){}},{id:1,position:new Vec3(2.5,65.2,.5)},{world:{bounds:opts.bounds}},null,null,null);
 assert.equal(goals.length,1);assert.equal(goals[0][1],65.1);
});

test('wood pickup finishes an airborne step instead of pausing and rejecting the drop',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),b=fixture(),t=new HutTeacher(),goal=[2.5,65.1,.5];b.entity.onGround=false;
 Object.assign(t,{dropTrack:{id:1},pickupTravelGoal:goal});let walked=false;
 t.walk=async(_b,_m,g)=>{assert.deepEqual(g,goal);walked=true;};
 await t.collectWood(b,{pause(){throw Error('Must not cancel a valid landing');}},{id:1},{world:{}},null,null,null);assert.equal(walked,true);
});

test('wood pickup abandons a stalled pursuit without continually renewing its deadline',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),b=fixture(),t=new HutTeacher();
 Object.assign(t,{dropTrack:{id:1,best:1,progressAt:Date.now()-13000},ignoredDrops:new Map()});
 await t.collectWood(b,{pause(){}},{id:1,position:new Vec3(2.5,64.2,.5)},{world:{}},null,null,null);assert.ok(t.ignoredDrops.has(1));
});

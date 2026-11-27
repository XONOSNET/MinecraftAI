const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3'),policy=require('../controller/shelter_policy');
test('persistent threat opt-in cannot filter other mobs and fails closed',()=>{
 const spider={name:'spider',id:1,isValid:true,position:new Vec3(9,64,0)},zombie={...spider,name:'zombie',id:2};
 const b={entity:{position:new Vec3(0,64,0)},world:{raycast:()=>null},entities:{1:spider,2:zombie}};
 assert.deepEqual(policy.threats(b),[spider,zombie]);
 b.labPersistentNeutralSpider=(e,p)=>{assert.equal(p,b.entity.position);return true;};
 assert.deepEqual(policy.threats(b),[zombie]);
 b.labPersistentNeutralSpider=()=>{throw Error('stale light');};
 assert.deepEqual(policy.threats(b),[spider,zombie]);
 b.labPersistentNeutralSpider=()=>1;
 assert.deepEqual(policy.threats(b),[spider,zombie]);
});

test('a calm close spider is not attacked even though it still fails exit clearance',async()=>{
 const defense=require('../controller/survival_defense'),burrow=require('../controller/emergency_burrow');
 let attacks=0;
 const e={id:7,name:'spider',isValid:true,position:new Vec3(2.5,64,.5),metadata:[],width:1.4,height:.9};
 const b={health:20,food:20,time:{timeOfDay:6000},registry:require('minecraft-data')('1.21.4'),
  entity:{position:new Vec3(.5,64,.5),yaw:-Math.PI/2,onGround:true,velocity:new Vec3(0,0,0)},entities:{7:e},
  inventory:{slots:[],items:()=>[{name:'wooden_axe',count:1}]},heldItem:{name:'wooden_axe',count:1},
  game:{minY:-64,height:384},world:{raycast:()=>null},blockAt:()=>({name:'air',boundingBox:'empty'}),
  lookAt:async()=>{},setControlState(){},attack(){attacks++;},deactivateItem(){},labPersistentNeutralSpider:()=>false};
 const t={wilderness:{memory:{encounter(){}}}},state={run:'close-regression',world:{first_night:{hostiles:true},bounds:[-16,16,-16,16]}};
 const motor={pause(){},command(){},lockLook(){}};
 const scan=()=>({pooled:Array(64).fill(0),hits:[],proximity:{canWalk:()=>true}});
 const api=async(_p,d)=>({action:d.teacher});
 assert.equal(policy.assess(b,state.world,t).mode,'fight','legacy distance-only classification reproduced');
 await defense.tick(t,b,motor,state,api,scan);assert.equal(attacks,1,'old path actually requests an attack on the calm spider');
 b.labPersistentCalmSpider=()=>true;
 assert.equal(policy.neutralSpider(b,e),false,'close exit guard is unchanged');
 assert.equal(policy.assess(b,state.world,t).mode,'work');
 assert.equal(defense.target(t,b,state.world),null);
 assert.equal(await defense.tick(t,b,motor,state,api,scan),false);assert.equal(attacks,1);
 b.entity.position=new Vec3(.5,62,.5);e.position=new Vec3(.5,64,.5);
 assert.equal(await burrow.defendOpening(t,b,motor,{},new Vec3(0,64,0)),true,'physical occupancy still blocks sealing');
 assert.equal(attacks,1,'blocking calm creature is waited for, not provoked');
 assert.match(t.message,/calm spider/);
});

test('a calm spider cannot steal the defensive target from an actual hostile',()=>{
 const defense=require('../controller/survival_defense');
 const b={health:20,food:20,time:{timeOfDay:6000},entity:{position:new Vec3(0,64,0)},
  inventory:{slots:[],items:()=>[{name:'wooden_axe',count:1}]},world:{raycast:()=>null},
  labPersistentCalmSpider:()=>true,entities:{s:{id:1,name:'spider',position:new Vec3(2,64,0)},z:{id:2,name:'zombie',position:new Vec3(3,64,0)}}};
 const t={wilderness:{}};assert.equal(defense.target(t,b,{first_night:{hostiles:true},bounds:[-16,16,-16,16]}).name,'zombie');
 b.labPersistentCalmSpider=()=>false;assert.equal(defense.target(t,b,{first_night:{hostiles:true},bounds:[-16,16,-16,16]}).name,'spider');
});

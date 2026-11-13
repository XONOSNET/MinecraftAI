const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),choice=require('../controller/refuge_choice');
function fixture(){const b={username:'HomeChoice',players:{},entities:{},world:{raycast:()=>null},entity:{position:new Vec3(.5,64,-10.5),onGround:true},blockAt(p){p=p.floored();return {position:p,name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty'};}};return {b,t:{plot:{x:0,y:64,z:0},campPlots:[],milestones:['hut'],wilderness:{}},w:{bounds:[-64,64,-64,64]}};}
test('nearby earned home wins, while distant or damaged homes use local cover',()=>{
 const f=fixture();assert.equal(choice.homeReachable(f.t,f.b,f.w),true);
 f.b.entity.position.z=-40.5;assert.equal(choice.homeReachable(f.t,f.b,f.w),false);
 f.b.entity.position.z=-10.5;f.t.homeDamage={unsafe:true};assert.equal(choice.homeReachable(f.t,f.b,f.w),false);
});
test('a nearby home behind an impassable barrier is not treated as reachable shelter',()=>{
 const f=fixture(),at=f.b.blockAt;f.b.blockAt=p=>Math.floor(p.z)===-7?{position:p.floored(),name:'stone',boundingBox:'block'}:at(p);
 assert.equal(choice.homeReachable(f.t,f.b,f.w),false);
});
test('retreat travel avoids a visible hostile in the straight path to a reachable home',()=>{
 const {b,t,w}=fixture();
 b.entities.z={id:2,name:'zombie',position:new Vec3(.5,64,-7.5)};
 assert.equal(choice.homeReachable(t,b,w),true);
 const {WorldNavigation,homeApproach}=require('../controller/world_navigation');
 const avoidCell=choice.threatClearance(b),goal=homeApproach(t.plot,b);
 const nav=new WorldNavigation(),ordinary=nav.plan(b,goal,{bounds:w.bounds,now:1000});
 assert.ok(ordinary.path.some(q=>avoidCell([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])])));
 const retreat=nav.plan(b,goal,{bounds:w.bounds,now:1100,avoidCell});
 assert.equal(retreat.blocked,false);
 assert.ok(retreat.path.every(q=>!avoidCell([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])])));
});
test('a bot already indoors does not need a route through its own closed door',()=>{
 const f=fixture();f.b.entity.position=new Vec3(.5,64,.5);f.b.blockAt=()=>{throw Error('Safe indoor watch needs no exterior path');};assert.equal(choice.homeReachable(f.t,f.b,f.w),true);
});
test('a visible monster inside the house prevents choosing it as safe cover',()=>{
 const f=fixture();f.b.entities.z={id:2,name:'zombie',position:new Vec3(.5,64,.5)};assert.equal(choice.homeReachable(f.t,f.b,f.w),false);
});
test('cover priority chooses a reachable home first and a burrow when it is too far',()=>{
 const f=fixture();f.b.time={timeOfDay:14000};f.b.health=20;f.b.food=20;f.b.inventory={items:()=>[],slots:[]};f.t.phase='gather';
 const night=require('../controller/first_night');assert.equal(night.priority(f.b,f.t,{...f.w,first_night:{hostiles:true}}).kind,'retreat');
 f.b.entity.position.z=-40.5;assert.equal(night.priority(f.b,f.t,{...f.w,first_night:{hostiles:true}}).kind,'seek cover');
});
test('nightfall does not interrupt finishing a verified shell from inside it',()=>{
 const f=fixture(),night=require('../controller/first_night'),house=require('../controller/hut_teacher');
 f.t.phase='enter';f.t.milestones=[];f.b.entity.position=new Vec3(2.2,64,2.2);f.b.time={timeOfDay:14000};f.b.health=20;f.b.food=20;f.b.inventory={items:()=>[],slots:[]};
 const blocks=new Map(house.blueprint(f.t.plot).map(q=>[[q.x,q.y,q.z].join(','),q.table?'crafting_table':'oak_planks']));
 const at=f.b.blockAt;f.b.blockAt=p=>{const name=blocks.get(p.floored().toArray().join(','));return name?{position:p.floored(),name,boundingBox:'block'}:at(p);};
 assert.equal(night.priority(f.b,f.t,{...f.w,first_night:{hostiles:true}}).kind,'finish enclosure');
 blocks.delete('0,67,0');assert.notEqual(night.priority(f.b,f.t,{...f.w,first_night:{hostiles:true}}).kind,'finish enclosure','a damaged shell still needs cover');
});

const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{WorldNavigation}=require('../controller/world_navigation');
function flat(){return {username:'route-stall',players:{},entity:{position:new Vec3(.5,64,.5),onGround:true},blockAt(p){const q=p.floored(),solid=q.y<64;return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};}
test('occupied plot border permits departure while other plots remain private',()=>{
 const b=flat(),plot={x:0,y:64,z:0},other={x:10,y:64,z:0};b.entity.position=new Vec3(3.45,64,.5);
 const plan=new WorldNavigation().plan(b,[15.5,64.1,.5],{plot,plots:[plot,other],bounds:[-10,24,-12,12],now:0});
 assert.equal(plan.blocked,false);assert.ok(plan.path.length);
 assert.ok(plan.path.every(q=>!(q[0]>=7&&q[0]<=13&&q[2]>=-3&&q[2]<=3)));
});
test('long expedition return is not clipped to a 96-cell search box',()=>{
 const b=flat(),plan=new WorldNavigation().plan(b,[115.5,64.1,.5],{bounds:[-10,130,-8,8],now:0});
 assert.equal(plan.blocked,false);assert.equal(plan.path.at(-1)[0],115.5);
});
test('an unloaded destination permits only a checked prefix and never counts as arrival',()=>{
 const b=flat(),at=b.blockAt;b.blockAt=p=>p.x>=20?null:at(p);
 const plan=new WorldNavigation().plan(b,[60.5,64.1,.5],{bounds:[-10,70,-8,8],now:0});
 assert.equal(plan.blocked,false);assert.equal(plan.arrived,false);assert.ok(plan.path.length<=12);assert.ok(plan.path.every(q=>q[0]<20));
});
test('a known solid blocked destination cannot use partial-route fallback',()=>{
 const b=flat(),at=b.blockAt;b.blockAt=p=>p.x>=20?{position:p,name:'stone',boundingBox:'block'}:at(p);
 const plan=new WorldNavigation().plan(b,[60.5,64.1,.5],{bounds:[-10,70,-8,8],now:0});
 assert.equal(plan.blocked,true);assert.equal(plan.arrived,false);
});
test('unknown home door routes to the exterior instead of the unloaded room',()=>{
 const {approachGoal}=require('../controller/world_navigation'),b=flat(),plot={x:40,y:64,z:0},at=b.blockAt;b.blockAt=p=>p.x>=30?null:at(p);
 assert.deepEqual(approachGoal(b,[40.5,64.1,.5],plot),[40.5,64.1,-4.5]);
});

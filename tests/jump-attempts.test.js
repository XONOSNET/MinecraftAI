const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const attempts=require('../controller/jump_attempts'),{createMotor}=require('../controller/locomotion'),{WorldNavigation}=require('../controller/world_navigation');
function fixture(){const controls={},b={username:'JumpRetry',players:{},entity:{position:new Vec3(.5,64,.5),yaw:-Math.PI/2,pitch:0,onGround:true},blockAt(p){p=p.floored();const name=p.x===1&&p.z===0&&p.y<64?'air':p.y<64?'stone':'air';return {position:p,name,boundingBox:name==='air'?'empty':'block',getProperties:()=>({})};},getControlState:k=>!!controls[k],setControlState:(k,v)=>controls[k]=v,look:async()=>{}};return {b,controls};}

test('three missed physical jumps invalidate the crossing and select a checked route around it',()=>{
 const {b,controls}=fixture(),goal=[2.5,64.1,.5],nav=new WorldNavigation();let now=1000;
 attempts.scope(b,'trial-a');let plan=nav.plan(b,goal,{bounds:[-6,8,-6,6],now});assert.ok(plan.path.some(q=>q.gapFrom));
 const motor=createMotor(b,{move:true,jump:true,turn:true},{clock:()=>now}),task={gap_jump:true,waypoints:[goal],bounds:[-6,8,-6,6]};
 for(let i=0;i<3;i++){
  b.entity.position=new Vec3(.5,64,.5);b.entity.onGround=true;
  assert.match(motor.command(3,task,{},0),/checked one-block gap/);motor.tick();assert.equal(controls.jump,false);b.entity.position.x=.72;motor.tick();assert.equal(controls.forward,true);assert.equal(controls.jump,true);
  b.entity.onGround=false;now+=100;motor.tick();
  b.entity.position.y=63;b.entity.onGround=true;now+=100;motor.tick();
 }
 b.entity.position=new Vec3(.5,64,.5);assert.equal(attempts.blocked(b,[0,64,0],[2,64,0],now),true);
 assert.match(motor.command(3,task,{},0),/different checked route/);assert.equal(controls.jump,false);
 plan=nav.plan(b,goal,{bounds:[-6,8,-6,6],now:now+1});assert.equal(plan.blocked,false);assert.ok(plan.path.some(q=>Math.floor(q[2])!==0));assert.equal(plan.path.some(q=>q.gapFrom),false);
 assert.equal(nav.status.jump_recovery.blocked_crossings.length,1);
});

test('successful landings clear failures, opposite approaches stay available, and new trials reset them',()=>{
 const {b}=fixture(),a=[0,64,0],c=[2,64,0];attempts.scope(b,'a');for(let i=0;i<3;i++)attempts.finish(b,a,c,false,1000+i);
 assert.equal(attempts.blocked(b,c,a,1100),false);attempts.finish(b,a,c,true,1200);assert.equal(attempts.blocked(b,a,c,1201),false);
 for(let i=0;i<3;i++)attempts.finish(b,a,c,false,2000+i);assert.equal(attempts.blocked(b,a,c,122003),false,'temporary exclusion expires');
 for(let i=0;i<3;i++)attempts.finish(b,a,c,false,123000+i);attempts.scope(b,'b');assert.equal(attempts.blocked(b,a,c,123100),false);
});

test('danger cancellation of a committed jump does not count as a failed landing',()=>{
 const {b}=fixture(),motor=createMotor(b,{move:true,jump:true,turn:true},{clock:()=>1000});attempts.scope(b,'a');
 motor.command(3,{gap_jump:true,waypoints:[[2.5,64.1,.5]]},{},0);b.entity.onGround=false;motor.tick();motor.pause();
 assert.equal(attempts.report(b,1001).blocked_crossings.length,0);assert.equal(b.labJumpAttempts.edges.size,0);
});

test('failed step-ups are directed edges too, without banning the landing block',()=>{
 const {b}=fixture(),from=[0,64,0],to=[0,65,-1];for(let i=0;i<3;i++)attempts.finish(b,from,to,false,1000+i);
 assert.equal(attempts.blocked(b,from,to,1100),true);assert.equal(attempts.blocked(b,[1,65,-1],to,1100),false);
});


test('gap launch waits for the near-edge takeoff and rejects leaves at the jump apex',()=>{
 const {b,controls}=fixture();b.entity.position.x=.12;let now=1000;
 const motor=createMotor(b,{move:true,jump:true,turn:true},{clock:()=>now}),task={gap_jump:true,waypoints:[[2.5,64.1,.5]]};
 motor.command(3,task,{},0);motor.tick();assert.equal(controls.forward,true);assert.equal(controls.jump,false,'do not jump from the back of the departure block');
 b.entity.position.x=.72;now+=150;motor.tick();assert.equal(controls.jump,true);assert.equal(controls.forward,true);
 const covered=fixture().b,original=covered.blockAt;covered.blockAt=p=>Math.floor(p.x)===1&&Math.floor(p.z)===0&&Math.floor(p.y)===67?{position:p.floored(),name:'oak_leaves',boundingBox:'block'}:original(p);
 assert.equal(require('../controller/checked_jump').gap(covered,[0,64,0],[2,64,0]),false,'full jump arc needs clearance above walking head height');
 const plan=new WorldNavigation().plan(covered,[2.5,64.1,.5],{bounds:[-6,8,-6,6],now});assert.equal(plan.blocked,false);assert.equal(plan.path.some(q=>q.gapFrom),false);
});


test('ordinary steering preserves takeoff alignment while an explicit hold can cancel it',()=>{
 const {b}=fixture(),motor=createMotor(b,{move:true,jump:true,turn:true},{clock:()=>1000}),task={gap_jump:true,waypoints:[[2.5,64.1,.5]]};
 assert.match(motor.command(3,task,{},0),/Approaching takeoff/);
 assert.match(motor.command(1,task,{},.1),/Approaching takeoff/);assert.equal(motor.committedJump(),true);
 motor.command(4,task,{},0);assert.equal(motor.committedJump(),false);assert.equal(b.labJumpAttempts?.edges.size||0,0);
});

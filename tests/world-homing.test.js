const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {route}=require('../controller/field_navigation'),{WorldNavigation,approachGoal}=require('../controller/world_navigation');
test('world teacher requests a jump for a verified ascending waypoint despite a distant terrace in the head probe',()=>{
 const tasks=require('../controller/tasks'),b={entity:{position:new Vec3(.5,64,.5),yaw:-Math.PI/2}},task={kind:'expedition',strict_ground:true,goal:[1.5,65.1,.5],waypoints:[[1.5,65.1,.5]]};
 assert.equal(tasks.teacherAction(b,task,{frontBlocked:true,headBlocked:true},{waypoint:0},0),3);
});
function landscape(ramp=true){
 return {username:'hill',players:{},entity:{position:new Vec3(.5,64,.5),onGround:true},blockAt(p){
  const q=p.floored(),upper=q.x>=5,height=upper?69:ramp&&q.z>=8&&q.x>=0?Math.min(69,64+q.x):64;
  const solid=q.y<height;return {name:solid?'stone':'air',boundingBox:solid?'block':'empty',position:q};
 }};
}
test('return planner takes a detour away from home to climb a five-block hill',()=>{
 const b=landscape(),r=route(b,[7.5,69.1,.5],24,8192,false,{reversible:true});
 assert.equal(r.reached,true);assert.ok(r.path.some(p=>p[2]>=8));assert.equal(r.path.at(-1)[1],69.1);
 for(let i=1;i<r.path.length;i++)assert.ok(Math.abs(r.path[i][1]-r.path[i-1][1])<=1.01);
});
test('a lower cell directly beneath home is never counted as reaching the upper floor',()=>{
 const b=landscape(false),r=route(b,[7.5,69.1,.5],16,2048);
 assert.equal(r.reached,false);
 const nav=new WorldNavigation(),plan=nav.plan(b,[7.5,69.1,.5],{bounds:[-30,30,-30,30],now:1000});
 assert.equal(plan.blocked,true);assert.deepEqual(plan.path,[],'partial routes are not executable world routes');
});
test('a closed home entrance is approached from outside before planning through its door',()=>{
 const b=landscape(),plot={x:8,y:69,z:0};b.blockAt=p=>({name:p.x===8&&p.y===69&&p.z===-2?'oak_door':'air',getProperties:()=>({open:false})});
 assert.deepEqual(approachGoal(b,[8.5,69.1,.5],plot),[8.5,69.1,-3.5]);
 b.entity.position=new Vec3(8.5,69,.5);assert.deepEqual(approachGoal(b,[8.5,69.1,.5],plot),[8.5,69.1,.5]);
});
test('failed home searches are throttled and terminate an oscillating attempt without claiming a route',()=>{
 const b=landscape(false),nav=new WorldNavigation(),goal=[7.5,69.1,.5],options={bounds:[-30,30,-30,30],now:1000};
 nav.plan(b,goal,options);assert.equal(nav.replanned,true);
 nav.plan(b,goal,{...options,now:1100});assert.equal(nav.replanned,false);
 b.entity.position=new Vec3(-.5,64,.5);
 assert.throws(()=>nav.plan(b,goal,{...options,now:92000}),/No route progress/);
});
test('home navigation reaches the entrance of a closed hut instead of chasing its unreachable interior',()=>{
 const b=landscape(),original=b.blockAt,plot={x:8,y:69,z:0};
 b.blockAt=p=>{
  const q=p.floored(),wall=q.y>=69&&q.y<=70&&(q.x===6||q.x===10)&&q.z>=-2&&q.z<=2||q.y>=69&&q.y<=70&&(q.z===-2||q.z===2)&&q.x>=6&&q.x<=10;
  return wall?{name:q.x===8&&q.z===-2?'oak_door':'oak_planks',boundingBox:'block',position:q,getProperties:()=>({open:false})}:original(p);
 };
 const goal=[8.5,69.1,.5];assert.equal(route(b,goal,24,8192).reached,false);
 const nav=new WorldNavigation(),r=nav.plan(b,goal,{plot,bounds:[-30,30,-30,30],now:1000});
 assert.equal(r.blocked,false);assert.deepEqual(nav.status.target,[8.5,69.1,-3.5]);
});

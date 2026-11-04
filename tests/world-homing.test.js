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
 const b=landscape(),plot={x:8,y:69,z:0};b.blockAt=p=>({name:p.x===8&&p.y===69&&p.z===-3?'oak_door':'air',getProperties:()=>({open:false})});
 assert.deepEqual(approachGoal(b,[8.5,69.1,.5],plot),[8.5,69.1,-4.5]);
 b.entity.position=new Vec3(8.5,69,.5);assert.deepEqual(approachGoal(b,[8.5,69.1,.5],plot),[8.5,69.1,.5]);
});

test('a trip behind the house still needs the front door and approaches it from inside',()=>{
 const {crossingHome}=require('../controller/world_navigation'),plot={x:8,y:69,z:0},b=landscape();b.entity.position=new Vec3(8.5,69,.5);
 b.blockAt=p=>({name:p.x===8&&p.y===69&&p.z===-3?'oak_door':'air',getProperties:()=>({open:false})});
 const goal=[12.5,69.1,30.5];assert.equal(crossingHome(b,goal,plot),true);assert.deepEqual(approachGoal(b,goal,plot),[8.5,69.1,-1.5]);
 assert.equal(crossingHome(b,[9.5,69.1,.5],plot),false);
});

test('door alignment follows the route out of the front door before turning toward a destination behind home',()=>{
 const {routeDoorway}=require('../controller/world_navigation'),plot={x:0,y:64,z:0},b={entity:{position:new Vec3(.5,64,-1.5)},blockAt:()=>({name:'oak_door',position:new Vec3(0,64,-3),getProperties:()=>({open:true,facing:'north'})})};
 assert.ok(routeDoorway(b,plot,[[.5,64.1,-2.5],[.5,64.1,-3.5],[1.5,64.1,-3.5]],[.5,64.1,8.5]));
});

test('door alignment authorizes a descent only for the next checked one-block landing',()=>{
 const {routeDoorway}=require('../controller/world_navigation'),plot={x:0,y:64,z:0},b={entity:{position:new Vec3(.5,64,-1.5)},blockAt:()=>({name:'oak_door',position:new Vec3(0,64,-3),getProperties:()=>({open:true,facing:'north'})})};
 const sill=[.5,64.1,-2.5],goal=[.5,63.1,-4.5];
 assert.equal(routeDoorway(b,plot,[sill,[.5,63.1,-3.5]],goal).descent,true);
 for(const path of [[sill],[sill,[.5,64.1,-3.5]],[sill,[.5,62.1,-3.5]]])assert.notEqual(routeDoorway(b,plot,path,goal).descent,true);
});

test('survival wood trip opens the enlarged house door from the room center even for resources behind home',async()=>{
 const survival=require('../controller/survival'),{HutTeacher}=require('../controller/hut_teacher'),t=new HutTeacher(),plot={x:0,y:64,z:0};
 let opened=false,walked=false;const b={entity:{position:new Vec3(.5,64,.5)},blockAt:p=>({name:'oak_door',position:p,getProperties:()=>({open:false})}),activateBlock:async()=>{opened=true;}};
 Object.assign(t,{plot,phase:'survival_wood_trip',survival:{station:{logs:[[5,64,30]]}},walk:async()=>{walked=true;}});
 await survival.tick(t,b,{pause(){}},{world:{}},null,null,null);assert.equal(opened,true);assert.equal(walked,false);assert.equal(t.phase,'survival_wood_trip');
});
test('failed home searches are throttled and terminate an oscillating attempt without claiming a route',()=>{
 const b=landscape(false),nav=new WorldNavigation(),goal=[7.5,69.1,.5],options={bounds:[-30,30,-30,30],now:1000};
 nav.plan(b,goal,options);assert.equal(nav.replanned,true);
 nav.plan(b,goal,{...options,now:1100});assert.equal(nav.replanned,false);
 b.entity.position=new Vec3(-.5,64,.5);
 assert.throws(()=>nav.plan(b,goal,{...options,now:92000}),/No route progress/);
});

test('a route refresh during a stair fall retains the checked landing instead of declaring no safe route',()=>{
 const b={username:'stairs',players:{},entity:{position:new Vec3(.5,64,.5),onGround:true},blockAt(p){const q=p.floored(),height=64+Math.min(0,q.z),solid=q.y<height;return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const nav=new WorldNavigation(),goal=[.5,61.1,-2.5],options={bounds:[-20,20,-20,20],now:1000};
 assert.equal(nav.plan(b,goal,options).blocked,false);const landing=[...nav.path[0]];
 b.entity.position=new Vec3(.5,63.5,-.4);b.entity.onGround=false;
 const falling=nav.plan(b,goal,{...options,now:5000});assert.equal(falling.blocked,false);assert.deepEqual([...falling.cue],landing);assert.equal(falling.cue.centering,true);
});

test('a new route requested in midair retries immediately after landing, without waiting for the replan timer',()=>{
 const b={username:'stairs',players:{},entity:{position:new Vec3(.5,63.5,-.4),onGround:false},blockAt(p){const q=p.floored(),solid=q.y<64+Math.min(0,q.z);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const nav=new WorldNavigation(),goal=[.5,61.1,-2.5],bounds=[-20,20,-20,20];
 assert.match(nav.plan(b,goal,{bounds,now:1000}).message,/Waiting to land/);
 b.entity.position=new Vec3(.5,63,-.5);b.entity.onGround=true;
 assert.equal(nav.plan(b,goal,{bounds,now:1050}).blocked,false);
});

test('airborne route retention never keeps a landing whose support disappeared',()=>{
 let removed=false;const b={username:'stairs',players:{},entity:{position:new Vec3(.5,64,.5),onGround:true},blockAt(p){const q=p.floored(),solid=q.y<64+Math.min(0,q.z)&&!(removed&&q.z===-1&&q.y===62);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const nav=new WorldNavigation(),goal=[.5,61.1,-2.5],bounds=[-20,20,-20,20];nav.plan(b,goal,{bounds,now:1000});
 removed=true;b.entity.position=new Vec3(.5,63.5,-.4);b.entity.onGround=false;
 assert.equal(nav.plan(b,goal,{bounds,now:5000}).blocked,true);
});
test('home navigation reaches the entrance of a closed hut instead of chasing its unreachable interior',()=>{
 const b=landscape(),original=b.blockAt,plot={x:8,y:69,z:0};
 b.blockAt=p=>{
  const q=p.floored(),wall=q.y>=69&&q.y<=70&&(q.x===5||q.x===11)&&q.z>=-3&&q.z<=3||q.y>=69&&q.y<=70&&(q.z===-3||q.z===3)&&q.x>=5&&q.x<=11;
  return wall?{name:q.x===8&&q.z===-3?'oak_door':'oak_planks',boundingBox:'block',position:q,getProperties:()=>({open:false})}:original(p);
 };
 const goal=[8.5,69.1,.5];assert.equal(route(b,goal,24,8192).reached,false);
 const nav=new WorldNavigation(),r=nav.plan(b,goal,{plot,bounds:[-30,30,-30,30],now:1000});
 assert.equal(r.blocked,false);assert.deepEqual(nav.status.target,[8.5,69.1,-4.5]);
});

test('door guidance persists when the occupied threshold waypoint was already consumed',()=>{
 const {routeDoorway}=require('../controller/world_navigation'),plot={x:0,y:64,z:0};
 const b={entity:{position:new Vec3(.5247,64,-2.3732)},blockAt:()=>({name:'oak_door',position:new Vec3(0,64,-3),shapes:[[0,0,0,.1875,1,1]],getProperties:()=>({open:true,facing:'north'})})};
 const outside=[.5,64.1,-3.5],d=routeDoorway(b,plot,[outside],[8.5,64.1,-10.5]);assert.ok(d);assert.equal(d.center,.59375);assert.equal(d.open,true);
 b.entity.position=new Vec3(.5,64,-1.5);assert.equal(routeDoorway(b,plot,[outside],[8.5,64.1,-10.5]),null,'do not create doorway shortcuts away from the occupied threshold');
 b.entity.position=new Vec3(.5247,64,-2.3732);assert.equal(routeDoorway(b,plot,[[.5,64.1,-1.5]],[.5,64.1,0]),null,'moving farther inside does not cross the door plane');
});

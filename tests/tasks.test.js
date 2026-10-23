const test=require('node:test');const assert=require('node:assert/strict');const {Vec3}=require('vec3');
const {createRuntime,observeTask,reached,teacherAction,interact}=require('../controller/tasks');
function fixture(){
 const task={kind:'jump',bounds:[297,343,-5,5],goal:[336,181.1,0],coverage_target:10,wood_target:1};
 const bot={entity:{position:new Vec3(304,181,0),yaw:-Math.PI/2,onGround:true},health:20,food:20,
  inventory:{items:()=>[]},blockAt:p=>({name:p.y<181?'stone':'air',boundingBox:p.y<181?'block':'empty',position:p.floored()}),canSeeBlock:()=>true};
 return {task,bot,runtime:createRuntime()};
}
test('extra task observations match the 82-input contract and use actual inventory',()=>{
 const {task,bot,runtime}=fixture();const sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(sensed.extra.length,12);assert.equal(sensed.metrics.wood,0);assert.equal(sensed.metrics.coverage,1);assert.equal(sensed.metrics.inside,true);
 assert.ok(sensed.extra.every(Number.isFinite));assert.equal(reached(task,sensed.metrics),false);
});
test('teacher jumps only at a low hurdle, not through a head-height wall',()=>{
 const {task,bot,runtime}=fixture();const sensed={frontBlocked:true,headBlocked:false};
 assert.equal(teacherAction(bot,task,sensed,runtime,0),3);
 sensed.headBlocked=true;assert.equal(teacherAction(bot,task,sensed,runtime,0),0);
});
test('harvesting requires explicit permission, visible logs and practice bounds',async()=>{
 const {task,bot,runtime}=fixture();task.kind='gather';let digs=0;
 bot.canDigBlock=()=>true;bot.lookAt=async()=>{};bot.look=async()=>{};bot.dig=async()=>digs++;
 const resource={name:'oak_log',position:new Vec3(305,181,0)};
 assert.equal(await interact(bot,task,{resource},runtime,5),false);
 assert.equal(await interact(bot,task,{resource},runtime,5,{harvest_oak_logs:true}),true);assert.equal(digs,1);
 resource.name='diamond_block';assert.equal(await interact(bot,task,{resource},runtime,5,{harvest_oak_logs:true}),false);
 resource.name='oak_log';bot.entity.position.x=0;assert.equal(await interact(bot,task,{resource},runtime,5,{harvest_oak_logs:true}),false);
});
test('food success requires hunger and a consumed item, not just full food',()=>{
 const {task}=fixture();task.kind='eat';const metrics={health:20,inside:true,y:181,food:20,eaten:0,hunger_observed:true};
 assert.equal(reached(task,metrics),false);metrics.eaten=1;assert.equal(reached(task,metrics),true);
});

test('exploration keeps turning consistently at a wall and moves once clear',()=>{
 const {task,bot,runtime}=fixture();task.kind='explore';
 for(const leftUnsafe of [false,true])assert.equal(teacherAction(bot,task,{frontBlocked:true,frontHazard:false,leftUnsafe},runtime,0),1);
 assert.equal(teacherAction(bot,task,{frontBlocked:false,frontHazard:false},runtime,0),0);
});

test('near-foot probes detect a hurdle when the far probe overshoots it',()=>{
 const {task,bot,runtime}=fixture();bot.entity.position.x=304.7;
 bot.blockAt=p=>({name:p.y<181?'stone':p.y<182&&Math.floor(p.x)===305?'oak_planks':'air',boundingBox:p.y<181||(p.y<182&&Math.floor(p.x)===305)?'block':'empty',position:p.floored()});
 const sensed=observeTask(bot,task,{hits:[]},runtime);assert.equal(sensed.frontBlocked,true);assert.equal(sensed.headBlocked,false);
});

test('eat then navigate requires both nutrition and arrival',()=>{
 const {task,bot,runtime}=fixture();task.kind='eat_route';task.food_target=18;
 const m={health:20,inside:true,y:181,food:18,eaten:1,hunger_observed:true,distance:20};
 assert.equal(reached(task,m),false);m.distance=.5;assert.equal(reached(task,m),true);
 const sensed={extra:[0,0,0,0,0,0,1]};bot.food=10;
 assert.equal(teacherAction(bot,task,sensed,runtime,0),6);
 bot.food=18;assert.equal(teacherAction(bot,task,sensed,runtime,0),0);
 task.kind='eat';task.food_target=20;assert.equal(teacherAction(bot,task,sensed,runtime,0),6);
});

test('mixed course steers through waypoints and jumps low obstacles',()=>{
 const {task,bot,runtime}=fixture();task.kind='mixed';task.waypoints=[[310,181,0],[336,181,0]];
 assert.equal(teacherAction(bot,task,{frontBlocked:true,headBlocked:false},runtime,1),3);
 bot.entity.position=new Vec3(310,181,0);
 teacherAction(bot,task,{frontBlocked:false,headBlocked:false},runtime,1);
 assert.equal(runtime.waypoint,1);
});

test('harvest action searches with the camera when a nearby log leaves the field of view',async()=>{
 const {task,bot,runtime}=fixture();task.kind='gather';const pitches=[];bot.look=async(yaw,pitch)=>pitches.push(pitch);
 assert.equal(await interact(bot,task,{resource:null},runtime,5,{}),false);
 for(let i=0;i<3;i++)await interact(bot,task,{resource:null},runtime,5,{harvest_oak_logs:true});
 assert.deepEqual(pitches,[-.7,0,.7]);
 const sensed={resource:null,metrics:{distance:1}};
 const actions=Array.from({length:4},()=>teacherAction(bot,task,sensed,runtime,0));
 assert.deepEqual(actions,[5,5,5,0]);
});


test('closed practice doors use an explicit bounded actuator and require observed opening',async()=>{
 const {task,bot,runtime}=fixture();task.kind='advanced';task.actual_doors=[[305,0]];let open=false,calls=0;
 const original=bot.blockAt;const door={name:'oak_door',position:new Vec3(305,181,0),boundingBox:'block',getProperties:()=>({open})};
 bot.blockAt=p=>Math.floor(p.x)===305&&Math.floor(p.y)===181&&Math.floor(p.z)===0?door:original(p);
 bot.look=async()=>{};bot.activateBlock=async()=>{calls++;open=true};let sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(sensed.extra[5],1);assert.equal(teacherAction(bot,task,sensed,runtime,0),5);
 assert.equal(await interact(bot,task,sensed,runtime,5,{}),false);
 assert.equal(await interact(bot,task,sensed,runtime,5,{open_practice_doors:true}),true);
 assert.equal(sensed.metrics.doors_opened,0);sensed=observeTask(bot,task,{hits:[]},runtime);assert.equal(sensed.metrics.doors_opened,1);assert.equal(calls,1);
});


test('advanced teacher and neural observation share the same checkpoint bearing',()=>{
 const {navigationTarget}=require('../controller/tasks');
 const {task,bot,runtime}=fixture();task.kind='advanced';task.waypoints=[[304,181,2],[320,181,2],task.goal];
 const point=navigationTarget(bot,task,runtime);
 const angle=Math.atan2(Math.sin(Math.atan2(-(point[0]-bot.entity.position.x),-(point[2]-bot.entity.position.z))-bot.entity.yaw),Math.cos(Math.atan2(-(point[0]-bot.entity.position.x),-(point[2]-bot.entity.position.z))-bot.entity.yaw));
 assert.equal(teacherAction(bot,task,{},runtime,angle),angle>0?1:2);
 bot.entity.position=new Vec3(304,181,2);
 assert.deepEqual(navigationTarget(bot,task,runtime),task.waypoints[1]);
 assert.equal(runtime.waypoint,1);
});


test('advanced hazard contact terminates a trial that can no longer pass',()=>{
 const {failed}=require('../controller/tasks');
 assert.equal(failed({kind:'advanced'},{hazard_contacts:0}),false);
 assert.equal(failed({kind:'advanced'},{hazard_contacts:1}),true);
 assert.equal(failed({kind:'gather'},{hazard_contacts:1}),false);
});


test('door upper half remains detectable and actionable when it hides the lower half',async()=>{
 const {task,bot,runtime}=fixture();task.kind='advanced';task.actual_doors=[[305,0]];
 const base=bot.blockAt;let opened=false,clicked=null;
 bot.blockAt=p=>p.x===305&&p.z===0&&[181,182].includes(p.y)?{name:'oak_door',position:p.clone(),getProperties:()=>({open:opened})}:base(p);
 bot.canSeeBlock=b=>b.position.y===182;
 bot.activateBlock=async b=>{clicked=b.position.y;opened=true};bot.look=async()=>{};
 const sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(sensed.extra[5],1);assert.equal(sensed.door.position.y,182);
 assert.equal(await interact(bot,task,sensed,runtime,5,{open_practice_doors:true}),true);
 assert.equal(clicked,182);assert.equal(observeTask(bot,task,{hits:[]},runtime).metrics.doors_opened,1);
});

test('forward motion blocked for eight seconds ends an advanced trial, turning does not',()=>{
 const {failed}=require('../controller/tasks');const {task,bot,runtime}=fixture();task.kind='advanced';runtime.lastAction=0;
 let sensed;for(let i=0;i<33;i++)sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(failed(task,sensed.metrics),true);
 runtime.lastAction=1;sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(sensed.metrics.blocked_steps,0);assert.equal(failed(task,sensed.metrics),false);
});


test('intermittent turns cannot extend a no-progress stall forever',()=>{
 const {failed}=require('../controller/tasks');const {task,bot,runtime}=fixture();task.kind='advanced';let sensed;
 for(let i=0;i<65;i++){runtime.lastAction=i%2?0:1;sensed=observeTask(bot,task,{hits:[]},runtime);}
 assert.equal(failed(task,sensed.metrics),true);
 bot.entity.position.x+=.6;sensed=observeTask(bot,task,{hits:[]},runtime);
 assert.equal(sensed.metrics.stalled_steps,0);assert.equal(failed(task,sensed.metrics),false);
});


test('terrain policy receives the same checkpoint cue as the teacher',()=>{
 const {navigationCue,failed}=require('../controller/tasks');const {task,bot,runtime}=fixture();
 task.kind='terrain';task.waypoints=[[310,181,3],[325,181,3],task.goal];
 assert.deepEqual(navigationCue(bot,task,runtime),task.waypoints[0]);
 bot.entity.position=new Vec3(310,181,3);
 assert.deepEqual(navigationCue(bot,task,runtime),task.waypoints[1]);
 assert.equal(failed(task,{hazard_contacts:1}),true);
 assert.equal(failed(task,{hazard_contacts:0,blocked_steps:0,stalled_steps:64}),true);
 assert.equal(failed(task,{hazard_contacts:0,blocked_steps:0,stalled_steps:0}),false);
});


test('vertical checkpoints cannot be skipped by matching only horizontal coordinates',()=>{
 const {navigationCue}=require('../controller/tasks');const {task,bot,runtime}=fixture();task.kind='expedition';task.waypoints=[[304,188,0],[310,188,0]];
 assert.deepEqual(navigationCue(bot,task,runtime),task.waypoints[0]);assert.equal(runtime.waypoint,0);
 bot.entity.position.y=188;assert.deepEqual(navigationCue(bot,task,runtime),task.waypoints[1]);
});

test('water is allowed only in designated swimming tasks and vertical actions are scoped',()=>{
 const {failed}=require('../controller/tasks');const {applyMotion}=require('../controller/motion');const {task,bot,runtime}=fixture();task.kind='expedition';task.allow_water=true;task.waypoints=[[304,185,0]];bot.entity.isInWater=true;bot.entity.velocity=new Vec3(0,0,0);
 const sensed=observeTask(bot,task,{hits:[]},runtime);assert.equal(sensed.metrics.hazard_contacts,0);assert.equal(sensed.extra.length,12);assert.ok(sensed.extra.every(Number.isFinite));assert.equal(teacherAction(bot,task,sensed,runtime,0),5);
 const state={};bot.getControlState=k=>!!state[k];bot.setControlState=(k,v)=>state[k]=v;
 applyMotion(bot,5,{move:true,jump:true},task);assert.equal(state.jump,true);assert.equal(!!state.forward,false);
 applyMotion(bot,5,{move:true,jump:true},{kind:'advanced'});assert.equal(state.jump,false);
 task.allow_water=false;assert.equal(observeTask(bot,task,{hits:[]},runtime).metrics.hazard_contacts,1);
});


test('expedition turns tread water and low breath prompts a surface action',()=>{
 const {applyMotion}=require('../controller/motion');const {task,bot,runtime}=fixture();task.kind='expedition';task.allow_water=true;task.waypoints=[[320,182,0]];bot.entity.isInWater=true;bot.oxygenLevel=8;
 const state={};bot.getControlState=k=>!!state[k];bot.setControlState=(k,v)=>state[k]=v;
 applyMotion(bot,1,{move:true,jump:true},task);assert.equal(state.jump,true);assert.equal(!!state.forward,false);
 assert.equal(teacherAction(bot,task,{},runtime,1),5);
});

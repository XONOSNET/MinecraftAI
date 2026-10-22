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
 bot.canDigBlock=()=>true;bot.lookAt=async()=>{};bot.dig=async()=>digs++;
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

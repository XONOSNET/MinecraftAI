const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{hold}=require('../controller/movement_handoff');
test('routine handoffs wait for a committed jump without renewing progress or blocking emergencies',()=>{
 const t={phase:'gather',lastProgress:123},motor={committedJump:()=>true};
 assert.equal(hold(t,motor),true);assert.equal(t.lastProgress,123);assert.equal(t.movementHandoffs.deferred_updates,1);
 assert.equal(hold(t,motor,{urgent:true}),false);assert.equal(t.movementHandoffs.urgent_updates,1);
 assert.equal(hold(t,{committedJump:()=>false}),false);
});
test('a tool-replacement interruption waits for landing before taking movement ownership',async()=>{
 const night=require('../controller/first_night'),t={phase:'night_stone',milestones:[],wilderness:{toolRecovery:{requested:'wooden_pickaxe'}},lastProgress:123};
 const b={health:20,food:20,entities:{},inventory:{items:()=>[]},entity:{position:new Vec3(.5,64.3,.5)},time:{timeOfDay:1000}};
 assert.equal(await night.interrupt(t,b,{committedJump:()=>true,pause(){throw Error('Routine tool work cannot cancel the jump');}},{world:{first_night:{hostiles:false}}}),true);
 assert.equal(t.phase,'night_stone');assert.equal(t.lastProgress,123);assert.ok(t.wilderness.toolRecovery);
});
test('the task dispatcher yields before construction and optional work while a jump owns movement',async()=>{
 const {HutTeacher}=require('../controller/hut_teacher'),t=new HutTeacher(),b={username:'LabAI0',health:20,food:20,players:{},entities:{},game:{gameMode:'survival'},entity:{position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>[]}};
 const motor={pause(){},committedJump:()=>false},state={run:'handoff',world:{bounds:[-64,64,-64,64]}},tasks={createRuntime:()=>({})};
 await t.tick(b,motor,state,async()=>{},null,tasks);
 t.phase='floor';t.plot={x:0,y:64,z:0};b.entity.onGround=false;motor.committedJump=()=>true;
 motor.pause=()=>{throw Error('Dispatcher cancelled the committed jump');};
 await t.tick(b,motor,state,async()=>{},()=>{throw Error('No new sensing or route action while jump is owned');},tasks);
 assert.equal(t.phase,'floor');assert.equal(t.movementHandoffs.deferred_updates,1);assert.equal(t.error,null);
});

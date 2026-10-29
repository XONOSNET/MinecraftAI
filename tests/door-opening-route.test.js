const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher');
test('a wall-hidden door does not pause a checked approach just because it is nearby',async()=>{
 const t=new HutTeacher(),plot={x:0,y:64,z:0},door={name:'oak_door',position:new Vec3(0,64,-3),getProperties:()=>({open:false})};let visible=false,opens=0,commands=0;
 const b={username:'door-view',players:{},health:20,food:20,entity:{position:new Vec3(-2,64,-4.5),yaw:0,onGround:true},blockAt:()=>door,world:{raycast:()=>({position:visible?door.position:new Vec3(-1,65,-3)})},activateBlock:async()=>{opens++;}};
 const cue=[.5,64.1,-4.5];Object.assign(t,{phase:'night_food_home',plot,campPlots:[plot],runtime:{},timing:{action(){},mark(){}},navigator:{portalFor:()=>plot,status:{},plan:()=>({path:[cue],cue,corridor:[cue],portal:plot})}});
 const motor={pause(){},command(){commands++;},diagnostic:()=>({})},tasks={observeTask:()=>({extra:[],metrics:{}}),teacherAction:()=>0},scan=()=>({pooled:[],proximity:{},hits:[]});
 const state={run:'door-test',world:{bounds:[-20,20,-20,20],driver:'student'}};
 await t.walk(b,motor,[.5,64.1,.5],state,async()=>({action:0}),scan,tasks);assert.equal(opens,0);assert.equal(commands,1);
 visible=true;await t.walk(b,motor,[.5,64.1,.5],state,async()=>({action:0}),scan,tasks);assert.equal(opens,1);assert.equal(commands,1);
});

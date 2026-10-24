const {test}=require('node:test');const assert=require('node:assert/strict');
const {motorPlan,createMotor}=require('../controller/locomotion');
const permissions={move:true,turn:true,jump:true},safe={frontBlocked:false,headBlocked:false,frontHazard:false};
test('walking and small steering corrections overlap, sharp turns and hazards stop travel',()=>{
 assert.equal(motorPlan(1,permissions,null,safe,.3).forward,true);
 assert.equal(motorPlan(2,permissions,null,safe,-2,true).forward,false);
 assert.equal(motorPlan(1,permissions,null,{...safe,frontHazard:true},.3,true).forward,false);
 assert.equal(motorPlan(1,permissions,null,{...safe,headBlocked:true},.3,true).forward,false);
 assert.equal(motorPlan(1,{...permissions,move:false},null,safe,.3,true).forward,false);
});
test('door interaction can overlap walking but mining remains stationary',()=>{
 const door={...safe,door:{name:'oak_door'}};
 assert.equal(motorPlan(5,permissions,{kind:'advanced'},door,0).forward,true);
 assert.equal(motorPlan(5,permissions,{kind:'gather'},door,0).forward,false);
 assert.equal(motorPlan(5,permissions,{kind:'advanced'},{...door,frontHazard:true},0).forward,false);
});
test('20 Hz motor rotates quickly with a bounded rate and stops stale intentions',()=>{
 let now=0;const state={},bot={entity:{yaw:0},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look(yaw){this.entity.yaw=yaw;return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now});motor.command(1,null,safe,1.5);
 for(let i=0;i<4;i++){now+=50;motor.tick();}
 assert.ok(bot.entity.yaw>.6&&bot.entity.yaw<.64);assert.equal(state.forward,undefined);
 now=1100;motor.tick();assert.equal(!!state.forward,false);const yaw=bot.entity.yaw;now+=50;motor.tick();assert.equal(bot.entity.yaw,yaw);
 motor.command(0,null,safe,0);now+=50;motor.tick();assert.equal(state.forward,true);motor.pause();assert.equal(state.forward,false);
});
test('motor respects the selected turn direction and reduces tiny corrections',()=>{
 assert.ok(motorPlan(1,permissions,null,safe,-.02).yaw>0);
 assert.ok(motorPlan(1,permissions,null,safe,-.02).yaw<.05);
 assert.equal(motorPlan(2,permissions,null,safe,1).yaw,-.95);
});

test('blocked movement reverses only with safe rear ground, then clears on pause',()=>{
 let now=0;const state={},pos={clone(){return this;},distanceTo(){return 0;}},bot={entity:{yaw:0,position:pos},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look(){return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now});
 const wall={...safe,wallAhead:true,rearSafe:true};
 motor.command(0,null,wall,0);motor.tick();assert.equal(!!state.forward,false);
 now=950;assert.match(motor.command(0,null,wall,0),/Reversing/);motor.tick();assert.equal(state.back,true);
 now=1000;motor.command(0,null,{...wall,rearSafe:false},0);motor.tick();assert.equal(state.back,false);
 motor.pause();assert.equal(state.back,false);
});
test('low clearance crouches while walking, without changing a policy action',()=>{
 let now=0;const state={},bot={entity:{yaw:0},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v};
 const motor=createMotor(bot,permissions,{clock:()=>now});
 assert.match(motor.command(0,null,{...safe,crouchClearance:true},0),/Crouching/);now=50;motor.tick();assert.equal(state.forward,true);assert.equal(state.sneak,true);
 motor.command(0,null,safe,0);now=100;motor.tick();assert.equal(state.sneak,false);
});

test('crouching uses a short collision box and the native 1.21.4 pose packet',()=>{
 const {Vec3}=require('vec3'),{applyPose}=require('../controller/locomotion');let ceiling=false;const controls={},packets=[];
 const bot={version:'1.21.4',physics:{},entity:{id:1,position:new Vec3(.5,181,.5)},_client:{write:(name,body)=>packets.push([name,body])},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,blockAt:p=>({shapes:ceiling&&p.y===182?[[0,.5,0,1,1,1]]:[]})};
 applyPose(bot,true);assert.equal(bot.physics.playerHeight,1.5);assert.equal(packets.at(-1)[1].actionId,'start_sneaking');
 ceiling=true;applyPose(bot,false);assert.equal(bot.physics.playerHeight,1.5);
 ceiling=false;applyPose(bot,false);assert.equal(bot.physics.playerHeight,1.8);assert.equal(packets.at(-1)[1].actionId,'stop_sneaking');
});

test('standing doorway movement brakes near its target without forcing sneak',()=>{
 const {Vec3}=require('vec3');let now=0;const state={};
 const bot={entity:{position:new Vec3(-.85,181,.59375),yaw:-Math.PI/2,velocity:new Vec3(.2,0,0)},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look(){return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now}),doorway={id:'door',axis:'x',plane:.5,center:.59375,open:true,y:181};
 motor.command(0,null,{...safe,doorway,canWalk:()=>true},0);now=50;motor.tick();assert.equal(!!state.forward,false);assert.equal(!!state.sneak,false);
 bot.entity.velocity=new Vec3(0,0,0);now=100;motor.tick();assert.equal(state.forward,true);assert.equal(!!state.sneak,false);
});

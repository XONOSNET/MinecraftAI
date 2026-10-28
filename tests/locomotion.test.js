const {test}=require('node:test');const assert=require('node:assert/strict');
const {motorPlan,createMotor}=require('../controller/locomotion');
const permissions={move:true,turn:true,jump:true},safe={frontBlocked:false,headBlocked:false,frontHazard:false};

test('short policy endpoints stop the wall probe at the checked destination',()=>{
 const {Vec3}=require('vec3');let now=0,clear=true;const controls={};
 const b={entity:{position:new Vec3(.5,64,.5),yaw:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v};
 const motor=createMotor(b,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true,safety_focus:[.5,64.1,.07],waypoints:[[.5,64.1,.07]]};
 const sensed={...safe,wallAhead:true,canWalk:(_y,d)=>clear&&d<.5,canStepDown:()=>false};
 motor.command(0,task,sensed,0);now+=50;motor.tick();assert.equal(controls.forward,true);
 clear=false;motor.command(0,task,sensed,0);now+=50;motor.tick();assert.equal(controls.forward,false);
});

test('travel looks smoothly above and below the horizon without interfering with a look lock',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},pitches=[];
 const bot={entity:{id:2,position:new Vec3(.5,64,.5),yaw:0,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,async look(y,p){this.entity.yaw=y;this.entity.pitch=p;pitches.push(p);}};
 const motor=createMotor(bot,permissions,{clock:()=>now}),q=[.5,64.1,-3.5],task={kind:'expedition',safe_walk:true,quick_look:true,safety_focus:q,waypoints:[q]};
 for(let i=0;i<120;i++){if(i%10===0)motor.command(0,task,{...safe,canStepDown:()=>true},0);now+=50;motor.tick();}
 assert.ok(Math.min(...pitches)<-.04);assert.ok(Math.max(...pitches)>.04);
 assert.ok(pitches.slice(1).every((p,i)=>Math.abs(p-pitches[i])<=.03001));
 motor.lockLook(true);const before=pitches.length;now+=50;motor.tick();assert.equal(pitches.length,before);
});

test('a safe doorway back-off is not blocked by the inward route corridor',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},bot={entity:{yaw:0,pitch:0,onGround:true,position:new Vec3(.5,70,-.3)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v};
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true,route_corridor:[[.5,70,-.3],[.5,70,.5],[.5,70,2]]};
 const sensed={...safe,canWalk:()=>true,canStepDown:()=>true,doorway:{id:'0,70,0',axis:'z',plane:.5,center:.5,open:true,y:70}};
 motor.command(0,task,sensed,0);now=50;motor.tick();assert.equal(controls.forward,true);
});

test('a verified descending terrace checks the immediate landing rather than the following stair',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={};
 const bot={entity:{position:new Vec3(.5,64,-.16),yaw:0,pitch:0,onGround:true,velocity:new Vec3(0,0,0)},players:{},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,blockAt(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),floor=64+Math.min(0,z);return {name:y<floor?'stone':'air',position:new Vec3(x,y,z),boundingBox:y<floor?'block':'empty'};}};
 const sensed={...safe,...proximity(bot,{recovery:false})};assert.equal(sensed.canStepDown(0,.75),false);assert.equal(sensed.canStepDown(0,.35),true);
 const motor=createMotor(bot,permissions,{clock:()=>now});motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[.5,63.1,-.5]]},sensed,0);now=50;motor.tick();assert.equal(controls.forward,true);assert.equal(!!controls.sprint,false);
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[.5,64.1,-.5]]},sensed,0);now=100;motor.tick();assert.equal(controls.forward,false);
});

test('descent support uses the same footprint as collision while the trailing edge overlaps the upper step',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={};
 const bot={players:{},entity:{position:new Vec3(.5,64,.0905),yaw:0,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,blockAt(p){const q=p.floored(),solid=q.y<64+Math.min(0,q.z);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const sensed={...safe,...proximity(bot,{recovery:false})};assert.equal(sensed.canStepDown(0,.35),true);
 const motor=createMotor(bot,permissions,{clock:()=>now});motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[.5,63.1,-.5]]},sensed,0);now=50;motor.tick();assert.equal(controls.forward,true);
});
test('strict world routes disallow an unplanned one-block drop but permit a checked descent',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},bot={entity:{yaw:0,pitch:0,onGround:true,position:new Vec3(0,70,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v};
 const motor=createMotor(bot,permissions,{clock:()=>now}),sensed={...safe,canWalk:()=>false,canStepDown:()=>true};
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[0,70.1,-1]]},sensed,0);now+=50;motor.tick();assert.equal(!!controls.forward,false);
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[0,69.1,-1]]},sensed,0);now+=50;motor.tick();assert.equal(controls.forward,true);
});
test('route corridor stops a policy from walking away from the planned path without changing its turn choice',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},bot={entity:{yaw:Math.PI/2,pitch:0,onGround:true,position:new Vec3(.5,70,.5)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look(yaw){this.entity.yaw=yaw;return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true,route_corridor:[[.5,70,.5],[.5,70,-3]]},sensed={...safe,canWalk:()=>true,canStepDown:()=>true};
 motor.command(0,task,sensed,0);now+=50;motor.tick();assert.equal(!!controls.forward,false);assert.equal(bot.entity.yaw,Math.PI/2);
 motor.command(2,task,sensed,-1);now+=50;motor.tick();assert.ok(bot.entity.yaw<Math.PI/2);
});

test('world policy forward and jump cannot carry a bot over unsupported ground',()=>{
 const {Vec3}=require('vec3');let now=0,supported=false;const controls={},bot={entity:{yaw:0,onGround:true,position:new Vec3(0,70,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v};
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,waypoints:[[0,70,-2]]},sensed={...safe,canStepDown:()=>supported};
 assert.match(motor.command(0,task,sensed,0),/unsafe drop/);now+=50;motor.tick();assert.equal(!!controls.forward,false);
 motor.command(3,task,sensed,0);now+=50;motor.tick();assert.equal(!!controls.jump,false);assert.equal(!!controls.forward,false);
 supported=true;motor.command(0,task,sensed,0);now+=50;motor.tick();assert.equal(controls.forward,true);
 supported=false;motor.command(3,{...task,waypoints:[[0,71.1,-1]]},sensed,0);now+=50;motor.tick();assert.equal(controls.jump,true);assert.equal(controls.forward,true);
 motor.command(3,{kind:'expedition'},sensed,0);now+=50;motor.tick();assert.equal(controls.jump,true,'ordinary expedition jump courses retain their controls');
});

test('world auto-step lifts a forward intention onto a checked adjacent block but respects wait and unsafe landings',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={};let landing=true;
 const bot={players:{},entity:{position:new Vec3(.5,64,.5),yaw:0,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,blockAt(p){const q=p.floored(),floor=q.z<0?65:64,solid=landing&&q.y<floor;return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const task={kind:'expedition',auto_step:true,safe_walk:true,strict_ground:true,waypoints:[[.5,65.1,-.5]]},motor=createMotor(bot,permissions,{clock:()=>now});
 motor.command(0,task,{...safe,...proximity(bot)},0);now+=50;motor.tick();assert.equal(controls.forward,true);assert.equal(controls.jump,true);
 motor.command(4,task,{...safe,...proximity(bot)},0);now+=50;motor.tick();assert.equal(controls.forward,false);assert.equal(controls.jump,false);
 landing=false;motor.command(0,task,{...safe,...proximity(bot)},0);now+=50;motor.tick();assert.equal(controls.jump,false);assert.equal(controls.forward,false);
});

test('nearby raised doorway cannot replace a verified step-up with stationary alignment',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={};
 const bot={players:{},entity:{position:new Vec3(.5,64,.5),yaw:0,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,
  blockAt(p){const q=p.floored(),solid=q.y<(q.z<0?65:64);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const task={kind:'expedition',auto_step:true,safe_walk:true,strict_ground:true,waypoints:[[.5,65.1,-.5]]},motor=createMotor(bot,permissions,{clock:()=>now});
 const doorway={id:'raised',axis:'z',plane:-1.5,center:.5,open:true,y:65};
 motor.command(0,task,{...safe,...proximity(bot),doorway},0);now+=50;motor.tick();
 assert.equal(controls.jump,true);assert.equal(controls.forward,true);assert.equal(motor.passageActive(),false);
});

test('player clearance stops at a precise ledge waypoint instead of probing through the next turn',()=>{
 const {Vec3}=require('vec3'),space=require('../controller/resource_space');let now=0;const controls={};
 const p=new Vec3(24633.5022,67,16515.2087),goal=[24633.5,67.1,16515.5],other=new Vec3(24631.498584671033,65,16515.69991907191);
 const yaw=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z));
 const bot={username:'ledge-test',players:{other:{username:'other',entity:{id:2,position:other}}},entity:{id:1,position:p,yaw,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,async look(yaw){this.entity.yaw=yaw;}};
 assert.equal(space.stepClear(p,{x:p.x-Math.sin(yaw)*.7,y:p.y,z:p.z-Math.cos(yaw)*.7},[other],2),false);
 assert.equal(space.stepClear(p,{x:goal[0],y:p.y,z:goal[2]},[other],2),true);
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true,center_route:true,safety_focus:goal,waypoints:[goal],avoid_players:true};
 motor.command(0,task,{...safe,canWalk:()=>true,canStepDown:()=>true,focusPoint:goal},0);now+=50;motor.tick();assert.equal(controls.forward,true);
 const unsafe=[24633.2,67.1,16515.5];bot.entity.yaw=Math.atan2(-(unsafe[0]-p.x),-(unsafe[2]-p.z));motor.command(0,{...task,safety_focus:unsafe,waypoints:[unsafe]},{...safe,canWalk:()=>true,canStepDown:()=>true,focusPoint:unsafe},0);now+=50;motor.tick();assert.equal(controls.forward,false);
});

test('world ground safety updates while the previous policy intention is still held',()=>{
 const {Vec3}=require('vec3');let now=0,ground=true;const controls={},bot={entity:{yaw:0,onGround:true,position:new Vec3(0,70,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,
  blockAt(p){const q=p.floored(),solid=ground&&q.y<70;return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty',shapes:solid?[[0,0,0,1,1,1]]:[]};}};
 const motor=createMotor(bot,permissions,{clock:()=>now});motor.command(0,{kind:'expedition',safe_walk:true},safe,0);now=50;motor.tick();assert.equal(controls.forward,true);
 ground=false;bot.entity.position=new Vec3(0,70,-.2);now=150;motor.tick();assert.equal(controls.forward,false);
});

test('locked world heading turns quickly without backing toward the old facing wall',()=>{
 const {Vec3}=require('vec3');let now=0;const state={},bot={entity:{yaw:0,position:new Vec3(0,70,0)},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look(yaw){this.entity.yaw=yaw;return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now});
 motor.command(1,{kind:'expedition',quick_look:true,navigation_lock:true},{...safe,wallAhead:true,rearSafe:true,focusPoint:[0,70,5]},Math.PI);
 for(let i=0;i<7;i++){now+=50;motor.tick();assert.equal(!!state.back,false);assert.equal(!!state.forward,false);}
 assert.ok(Math.abs(Math.atan2(Math.sin(bot.entity.yaw-Math.PI),Math.cos(bot.entity.yaw-Math.PI)))<.01);
 motor.command(0,{kind:'expedition',quick_look:true,navigation_lock:true},{...safe,focusPoint:[0,70,5]},0);now+=50;motor.tick();assert.equal(state.forward,true);
 bot.entity.position.z=4.9;now+=50;motor.tick();assert.equal(state.forward,false);
});

test('policy quick look preserves the chosen turn direction and mining look lock',()=>{
 let now=0;const state={},bot={entity:{yaw:0},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v,look(yaw){this.entity.yaw=yaw;return Promise.resolve();}};
 const motor=createMotor(bot,permissions,{clock:()=>now});
 motor.command(2,{kind:'expedition',quick_look:true},safe,1.5);now=50;motor.tick();assert.ok(bot.entity.yaw<-.4);
 const yaw=bot.entity.yaw;motor.lockLook(true);now=100;motor.tick();assert.equal(bot.entity.yaw,yaw);
});
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

test('precise route alignment brakes residual velocity before overshooting the center',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},bot={entity:{yaw:0,pitch:0,onGround:true,position:new Vec3(.5,64,-.16),velocity:new Vec3(0,0,-.15)},players:{},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look:()=>Promise.resolve(),blockAt(p){const q=p.floored();return {name:q.y<64?'stone':'air',position:q,boundingBox:q.y<64?'block':'empty'};}};
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',navigation_lock:true,center_route:true,safe_walk:true,strict_ground:true,waypoints:[[.5,64.1,-.5]]},sensed={...safe,focusPoint:[.5,64.1,-.5],canWalk:()=>true};
 motor.command(0,task,sensed,0);now=50;motor.tick();assert.equal(!!controls.forward,false,'coast into the center instead of accelerating through it');
 bot.entity.velocity.z=0;motor.command(0,task,sensed,0);now=100;motor.tick();assert.equal(controls.forward,true,'a stopped bot can still finish the precise approach');
});

test('a safe near center can be reached before turning beside a wall',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={},bot={entity:{yaw:Math.PI/2,pitch:0,onGround:true,position:new Vec3(.7,64,.5),velocity:new Vec3(0,0,0)},players:{},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look:()=>Promise.resolve(),blockAt(p){const q=p.floored(),solid=q.y<64||q.x===-1&&q.y<67;return {name:solid?'stone':'air',position:q,boundingBox:solid?'block':'empty'};}};
 const sensed={...safe,...proximity(bot),focusPoint:[.5,64.1,.5],cueDistance:.2};assert.equal(sensed.canWalk(Math.PI/2,.75),false);assert.equal(sensed.canWalk(Math.PI/2,.2),true);
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',navigation_lock:true,center_route:true,safe_walk:true,strict_ground:true,waypoints:[[.5,64.1,.5]]};motor.command(0,task,sensed,0);now=50;motor.tick();assert.equal(controls.forward,true);
 motor.command(0,task,{...sensed,focusPoint:[-.1,64.1,.5],cueDistance:.8},0);now=100;motor.tick();assert.equal(!!controls.forward,false,'the same probe still refuses an obstructed destination');
});

test('expired controls stop without restarting a committed doorway from the opposite side',()=>{
 const {Vec3}=require('vec3');let now=0;const controls={},bot={entity:{yaw:Math.PI,pitch:0,onGround:true,position:new Vec3(.5,70,-.65)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look:()=>Promise.resolve()};
 const motor=createMotor(bot,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true},sensed={...safe,canWalk:()=>true,canStepDown:()=>true,doorway:{id:'0,70,0',axis:'z',plane:.5,center:.5,open:true,y:70}};
 assert.match(motor.command(0,task,sensed,0),/crossing/);now=50;motor.tick();assert.equal(controls.forward,true);
 now=4000;motor.tick();assert.equal(!!controls.forward,false);assert.equal(motor.diagnostic().expired,true);
 bot.entity.position.z=.7;assert.match(motor.command(0,task,sensed,0),/crossing/,'resume the original crossing instead of selecting a new entry side');now=4050;motor.tick();assert.equal(controls.forward,true);
 motor.pause();assert.equal(motor.passageActive(),false,'an explicit mode/task pause still clears the maneuver');
});


test('a verified descending landing does not enter wall-recovery based on the upper lip',()=>{
 const {Vec3}=require('vec3'),{proximity}=require('../controller/perception');let now=0;const controls={};
 const b={players:{},entity:{position:new Vec3(.5,64,-.16),yaw:0,pitch:0,onGround:true,velocity:new Vec3(0,0,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,blockAt(p){const q=p.floored(),solid=q.y<64+Math.min(0,q.z);return {position:q,name:solid?'stone':'air',boundingBox:solid?'block':'empty'};}};
 const motor=createMotor(b,permissions,{clock:()=>now}),task={kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[.5,63.1,-.5]]};
 const sensed={...safe,...proximity(b,{recovery:false}),wallAhead:true,headBlocked:true};motor.command(0,task,sensed,0);now=50;motor.tick();assert.equal(controls.forward,true);assert.equal(motor.diagnostic().recovering,false);
});

test('policy ground checks stop at a verified waypoint instead of beyond its ledge',()=>{
 const {Vec3}=require('vec3'),controls={},bot={players:{},entity:{yaw:-Math.PI/2,pitch:0,onGround:true,position:new Vec3(.97,67,.5),velocity:new Vec3(0,0,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,
 blockAt(p){const q=p.floored(),floor=q.x<2?67:66;return {name:q.y<floor?'stone':'air',position:q,boundingBox:q.y<floor?'block':'empty'};}};
 const {proximity}=require('../controller/perception'),sensed=proximity(bot),motor=createMotor(bot,permissions);
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true},sensed,0);motor.tick();assert.equal(!!controls.forward,false);
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,safety_focus:[1.5,67.1,.5]},sensed,0);motor.tick();assert.equal(controls.forward,true);
 motor.command(0,{kind:'expedition',safe_walk:true,strict_ground:true,safety_focus:[2.5,67.1,.5]},sensed,0);motor.tick();assert.equal(!!controls.forward,false);
});
test('policy waypoint braking stops momentum without selecting a heading',()=>{
 const {Vec3}=require('vec3'),controls={},bot={entity:{yaw:-Math.PI/2,pitch:0,onGround:true,position:new Vec3(1.4,67,.5),velocity:new Vec3(.2,0,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look(){throw Error('Safety braking must not steer');}};
 const motor=createMotor(bot,permissions);motor.command(0,{kind:'expedition',safety_focus:[1.5,67.1,.5]},safe,0);motor.tick();assert.equal(!!controls.forward,false);
});

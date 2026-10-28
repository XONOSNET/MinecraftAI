const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{createStrafe,safe}=require('../controller/strafe'),{createMotor}=require('../controller/locomotion'),{defaults}=require('../controller/behavior');
function bot(terrain=()=>true){const controls={};return {username:'StrafeA',players:{},entity:{id:1,position:new Vec3(.5,64,.5),yaw:0,pitch:0,onGround:true,velocity:new Vec3(0,0,0)},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v,look:async()=>{},blockAt(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),solid=y<64&&terrain(x,z);return {name:solid?'stone':'air',boundingBox:solid?'block':'empty',position:new Vec3(x,y,z)};}};}
test('alignment adds checked diagonal strafing in both directions across navigation tasks',()=>{
 for(const kind of ['gather','expedition','terrain','shelter','advanced','explore']){const b=bot(),s=createStrafe(b),task={kind};assert.equal(s.choose(1,task,{cueDistance:5},.3,{forward:true},0).side,1);assert.equal(s.choose(2,task,{cueDistance:5},-.3,{forward:true},50).side,-1);}
});
test('lateral and diagonal footprints reject bridge edges, lava, bounds and crowding',()=>{
 assert.equal(safe(bot(x=>x===0),{},1,true),false);
 const b=bot();assert.equal(safe(b,{bounds:[0,8,0,8]},1),false);
 b.players.other={username:'Other',gamemode:0,entity:{id:2,position:new Vec3(-1,64,.5)}};assert.equal(safe(b,{},1),false);
 const lava=bot(),at=lava.blockAt;lava.blockAt=p=>{const v=at(p);if(v.position.x<0&&p.y<64)v.name='lava';return v;};assert.equal(safe(lava,{},1),false);
});
test('stairs, swimming, doors, harvesting and ordinary waiting do not add lateral drift',()=>{
 const b=bot(),s=createStrafe(b);for(const action of [3,4,5,6])assert.equal(s.choose(action,{}, {},.3,{},0),null);
 assert.equal(s.choose(1,{waypoints:[[.5,65.1,-1]]},{},.3,{},0),null);
 assert.equal(s.choose(1,{}, {door:{}},.3,{},0),null);
 b.entity.isInWater=true;assert.equal(s.choose(1,{}, {},.3,{},0),null);
});
test('combat circles on a stable side during cooldown and attacking, but not while equipping',()=>{
 const b=bot(),s=createStrafe(b),sensed={enemy:{},sight:true,distance:2.5},task={kind:'combat'};
 const side=s.choose(4,task,sensed,0,{},0).side;assert.equal(s.choose(6,task,sensed,0,{},200).side,side);assert.equal(s.choose(5,task,sensed,0,{},250),null);
});
test('obstacle sidesteps are bounded and pause and stale responses release lateral keys',()=>{
 const b=bot();let now=0;const m=createMotor(b,{move:true,turn:true,jump:true},{clock:()=>now}),sensed={wallAhead:true,cueDistance:5};
 m.command(0,{safe_walk:true},sensed,0);now=50;m.tick();assert.equal(!!b.getControlState('left')||!!b.getControlState('right'),true);assert.equal(!!b.getControlState('forward'),false);
 m.pause();assert.equal(!!b.getControlState('left'),false);assert.equal(!!b.getControlState('right'),false);
 m.command(1,{}, {cueDistance:5},.3);now=1200;m.tick();assert.equal(!!b.getControlState('left'),false);assert.equal(!!b.getControlState('right'),false);
 const s=createStrafe(b);assert.ok(s.choose(0,{},sensed,0,{forward:true},0));b.entity.position.x+=.7;assert.equal(s.choose(0,{},sensed,0,{forward:true},200),null);
});
test('per-bot settings can disable strafing without disabling movement',()=>{
 const b=bot();b.labBehavior={values:{...defaults,strafe_enabled:0}};assert.equal(createStrafe(b).choose(1,{}, {},.3,{forward:true},0),null);
});


test('passive-animal hunting disables circling and route alignment strafing',()=>{
 const b=bot(),s=createStrafe(b),sensed={enemy:{},sight:true,distance:2.5,cueDistance:5};
 for(const task of [{kind:'combat',mobs:['cow']},{kind:'combat',combat_style:'hunt'},{kind:'expedition',hunting:true}])
  for(const action of [0,1,2,3,4,6])assert.equal(s.choose(action,task,sensed,.3,{forward:true},0),null);
});

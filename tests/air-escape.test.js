const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),air=require('../controller/air_escape');
function fixture(){const controls={},b={username:'AirTest',players:{},labOxygen:10,entity:{position:new Vec3(.5,61.2,.5),eyeHeight:1.62,isInWater:true,yaw:0},blockAt(p){p=p.floored();const roof=Math.abs(p.x)<=1&&Math.abs(p.z)<=1;const name=p.y<60?'stone':p.y<=62?'water':p.y===63&&roof?'grass_block':'air';return {position:p,name,boundingBox:['water','air'].includes(name)?'empty':'block',getProperties:()=>({level:0})};},setControlState:(k,v)=>controls[k]=v,look:async()=>{}};return {b,controls,state:{world:{bounds:[-20,20,-20,20]}}};}
test('an underwater overhang requires horizontal escape before rising to breathable water',()=>{
 const f=fixture(),path=air.plan(f.b,{bounds:f.state.world.bounds});assert.ok(path?.length);assert.equal(path[0][1],61.1);assert.equal(path.at(-1)[1],62.1);
 for(const q of path)assert.ok(air.cell(f.b,new Vec3(Math.floor(q[0]),Math.floor(q[1]),Math.floor(q[2]))));
 assert.equal(air.cell(f.b,new Vec3(Math.floor(path.at(-1)[0]),62,Math.floor(path.at(-1)[2]))).breathable,true);
});
test('air escape is bounded and refuses hidden exits, solid roofs, currents and private homes',()=>{
 for(const mode of ['roof','unloaded','current','private']){
  const f=fixture(),at=f.b.blockAt;f.b.blockAt=p=>{const v=at(p);if(mode==='roof'&&p.y===63)return {...v,name:'stone',boundingBox:'block'};if(mode==='unloaded'&&(Math.abs(p.x)>1||Math.abs(p.z)>1))return null;if(mode==='current'&&v.name==='water')return {...v,getProperties:()=>({level:8})};return v;};
  assert.equal(air.plan(f.b,{bounds:f.state.world.bounds,plots:mode==='private'?[{x:0,y:61,z:0}]:[]}),null,mode);
 }
});
test('emergency submerged movement overrides work without completing its interrupted phase',()=>{
 const f=fixture(),t={phase:'gather',campPlots:[]},commands=[],motor={command:(a,task)=>commands.push({a,task})};
 assert.equal(air.tick(t,f.b,motor,f.state),true);assert.equal(commands[0].task.air_escape,true);assert.equal(t.phase,'gather');assert.equal(t.lastNavigation.oxygen,10);
 f.b.entity.position=new Vec3(2.5,62.2,.5);assert.equal(air.tick(t,f.b,motor,f.state),false);assert.equal(t.airEscape,null);
});
test('underwater escape holds forward beneath a roof while keeping buoyancy',()=>{
 const f=fixture();f.b.entity.yaw=-Math.PI/2;assert.equal(air.drive(f.b,[1.5,61.1,.5],{move:true,jump:true,turn:true}),true);assert.equal(f.controls.forward,true);assert.equal(f.controls.jump,true);
});


test('a flowing-water boundary keeps sensed underwater buoyancy without authorizing travel through currents',()=>{
 const f=fixture(),original=f.b.blockAt;f.b.entity.isInWater=false;
 f.b.blockAt=p=>{const v=original(p);return v.name==='water'?{...v,getProperties:()=>({level:8})}:v;};
 const t={phase:'gather',campPlots:[]},commands=[],motor={command:(action,task)=>commands.push({action,task})};
 assert.equal(air.plan(f.b,{bounds:f.state.world.bounds}),null);
 assert.equal(air.tick(t,f.b,motor,f.state),true);
 assert.equal(commands[0].task.air_escape,true);assert.equal(commands[0].task.water_route,undefined);
 const goal=commands[0].task.waypoints[0];assert.equal(goal[0],f.b.entity.position.x);assert.equal(goal[2],f.b.entity.position.z);
 assert.equal(air.drive(f.b,goal,{move:true,jump:true,turn:true}),false);
 assert.equal(f.controls.forward,false);assert.equal(f.controls.jump,true);assert.equal(t.phase,'gather');
 air.drive(f.b,goal,{move:true,jump:false,turn:true});assert.equal(f.controls.jump,false);
 f.b.entity.position=new Vec3(2.5,62.2,.5);
 air.drive(f.b,[2.5,63.2,.5],{move:true,jump:true,turn:true});assert.equal(f.controls.jump,false);
 assert.equal(air.tick(t,f.b,motor,f.state),false);assert.equal(t.airEscape,null);
});

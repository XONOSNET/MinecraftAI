const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),water=require('../controller/water_navigation'),{route,standable}=require('../controller/field_navigation'),{WorldNavigation}=require('../controller/world_navigation');
function fixture(){
 const cells=new Map(),controls={},b={username:'WaterTest',players:{},labOxygen:20,entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,yaw:-Math.PI/2},blockAt(p){p=p.floored();const key=p.toString(),wet=p.x>=3&&p.x<=6&&p.y>=61&&p.y<=63,name=cells.get(key)||(wet?'water':p.y<64?'stone':'air');return {position:p,name,boundingBox:['air','water','lava','bubble_column'].includes(name)?'empty':'block',getProperties:()=>({level:0})};},setControlState(k,v){controls[k]=v;},look:async()=>{}};
 return {b,cells,controls};
}

test('a waterside home uses its supported front bank instead of a marker above water',()=>{
 const {b}=fixture(),plot={x:0,y:64,z:0},bounds=[-12,12,-14,12];
 b.entity.position=new Vec3(2.5,64,-1.5);
 b.blockAt=p=>{p=p.floored();const wet=p.z<=-5&&p.y>=61&&p.y<=63,name=wet?'water':p.y<64?'stone':'air';return {position:p,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 const {homeApproach}=require('../controller/world_navigation'),goal=homeApproach(plot,b);
 assert.deepEqual(goal,[.5,64.1,-3.5]);assert.equal(standable(b,0,64,-4),false);assert.equal(water.cell(b,0,64,-4).wet,false);
 const plan=new WorldNavigation().plan(b,goal,{plot,plots:[plot],bounds});assert.equal(plan.blocked,false);assert.equal(plan.water_route,true);
 assert.deepEqual(require('../controller/floor_builder').returnGoal({plot,campPlots:[]},b,{world:{bounds}}),goal);
 const at=b.blockAt;b.blockAt=p=>{const v=at(p);return v.name==='water'?{...v,getProperties:()=>({level:2})}:v;};
 const unsafe=homeApproach(plot,b);assert.notDeepEqual(unsafe,goal,'a bank beside a current cannot use the checked source-water fallback');
});

test('an already-reached bank accepts an empty route without accepting distant goals or open water',()=>{
 const {b}=fixture(),goal=[7.5,64.1,.5];b.entity.position=new Vec3(7.5,64,.27);
 assert.equal(standable(b,7,64,0),false);assert.equal(water.validRoute(b,[],goal),true);
 const plan=new WorldNavigation().plan(b,goal,{bounds:[-2,13,-3,3]});assert.equal(plan.blocked,false);assert.equal(plan.arrived,true);
 assert.equal(water.validRoute(b,[],[10.5,64.1,.5]),false);assert.equal(water.validRoute(b,[],[4.5,63.1,.5]),false);
 b.entity.onGround=false;assert.equal(water.validRoute(b,[],goal),false);
});
test('surface route crosses source water and reaches a verified bank without changing dry work footing',()=>{
 const {b}=fixture(),goal=[10.5,64.1,.5],bounds=[-2,13,-3,3];
 assert.equal(route(b,goal,20,4096,true,{bounds,reversible:true}).reached,false);
 const r=route(b,goal,20,4096,true,{bounds,reversible:true,allowWater:true});assert.equal(r.reached,true);assert.equal(water.validRoute(b,r.path,goal),true);assert.ok(r.path.some(q=>water.cell(b,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2]))?.wet));assert.equal(standable(b,4,63,0),false);
 const n=new WorldNavigation(),p=n.plan(b,goal,{bounds});assert.equal(p.blocked,false);assert.equal(p.water_route,true);assert.equal(p.arrived,false);
});
test('water transit rejects covered surfaces, currents, bubbles, lava and unloaded cells',()=>{
 const {b,cells}=fixture();assert.equal(water.cell(b,4,63,0).mode,'swim');
 for(const [q,name] of [[new Vec3(4,64,0),'stone'],[new Vec3(4,62,0),'bubble_column'],[new Vec3(5,63,0),'lava']]){cells.set(q.toString(),name);assert.equal(water.cell(b,4,63,0),null);cells.clear();}
 const at=b.blockAt;b.blockAt=p=>{const v=at(p);return v.name==='water'?{...v,getProperties:()=>({level:2})}:v;};assert.equal(water.cell(b,4,63,0),null);
 b.blockAt=()=>null;assert.equal(water.cell(b,4,63,0),null);
});
test('crossing needs a dry destination and low air prevents new water entry',()=>{
 const {b}=fixture();assert.equal(water.validRoute(b,[[4.5,63.1,.5]],[4.5,63.1,.5]),false);
 b.labOxygen=3;assert.equal(water.cell(b,4,63,0),null,'do not enter water on low air');b.entity.isInWater=true;assert.ok(water.cell(b,4,63,0),'a swimmer must still be allowed to surface and exit');
});
test('physics controller swims upward and stops forward movement if a crossing becomes obstructed',()=>{
 const {b,cells,controls}=fixture();b.entity.position=new Vec3(3.5,63,.5);b.entity.isInWater=true;b.entity.onGround=false;
 assert.equal(water.drive(b,[4.5,63.1,.5],{move:true,jump:true,turn:true}),true);assert.equal(controls.forward,true);assert.equal(controls.jump,true);assert.equal(controls.sneak,false);
 cells.set(new Vec3(4,64,0).toString(),'stone');assert.equal(water.drive(b,[4.5,63.1,.5],{move:true,jump:true,turn:true}),false);assert.equal(controls.forward,false);assert.equal(controls.jump,true,'keep seeking the surface while holding position');
});


test('an available dry detour is preferred and shallow supported water is waded',()=>{
 const {b,cells}=fixture(),at=b.blockAt;b.blockAt=p=>Math.abs(Math.floor(p.z))>1?{name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty',position:p.floored()}:at(p);
 const n=new WorldNavigation(),plan=n.plan(b,[10.5,64.1,.5],{bounds:[-2,13,-7,7]});assert.equal(plan.blocked,false);assert.equal(plan.water_route,false);
 cells.set(new Vec3(4,62,0).toString(),'stone');assert.equal(water.cell(b,4,63,0).mode,'wade');
});


test('rising onto the bank finishes the last wet waypoint without turning back into the channel',()=>{
 const {b}=fixture();b.entity.position=new Vec3(6.7,64,.5);b.entity.onGround=true;
 const n=new WorldNavigation(),now=Date.now();n.waterRoute=true;n.destination='10.5,64.1,0.5';n.lastPlan=now;n.progressAt=now;n.best=10;n.anchor=[5.5,63.1,.5];
 const wet=[6.5,63.1,.5];wet.centering=true;n.path=[wet,[7.5,64.1,.5],[10.5,64.1,.5]];
 const p=n.plan(b,[10.5,64.1,.5],{bounds:[-2,13,-3,3],now});assert.ok(p.cue[0]>=7.5,'keep moving onto the dry bank');
});


test('a swimmer rising above the last water cell keeps moving onto the checked bank',()=>{
 const {b,controls}=fixture();b.entity.position=new Vec3(6.7,64.45,.5);b.entity.isInWater=false;b.entity.onGround=false;
 assert.equal(water.drive(b,[7.5,64.1,.5],{move:true,jump:true,turn:true}),true);assert.equal(controls.forward,true);
});


test('uninterrupted swimming is bounded even when a distant dry bank exists',()=>{
 const {b}=fixture();b.blockAt=p=>{p=p.floored();const wet=p.x>=1&&p.x<=25&&p.y>=61&&p.y<=63,name=wet?'water':p.y<64?'stone':'air';return {name,position:p,boundingBox:wet||name==='air'?'empty':'block',getProperties:()=>({level:0})};};
 const path=Array.from({length:25},(_,i)=>[i+1.5,63.1,.5]);path.push([26.5,64.1,.5]);assert.equal(water.validRoute(b,path,[26.5,64.1,.5]),false);
});

test('water motor honors wait actions while maintaining buoyancy',()=>{
 const {b,controls}=fixture();b.entity.position=new Vec3(3.5,63,.5);b.entity.isInWater=true;b.getControlState=k=>!!controls[k];
 const motor=require('../controller/locomotion').createMotor(b,{move:true,jump:true,turn:true});
 motor.command(4,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0);motor.tick();assert.equal(controls.forward,false);assert.equal(controls.jump,true);
 motor.command(0,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0);motor.tick();assert.equal(controls.forward,true);
 motor.pause();assert.equal(controls.forward,false);assert.equal(controls.jump,true);
});

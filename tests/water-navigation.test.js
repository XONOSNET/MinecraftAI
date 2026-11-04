const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),water=require('../controller/water_navigation'),{route,standable}=require('../controller/field_navigation'),{WorldNavigation}=require('../controller/world_navigation');
function fixture(){
 const cells=new Map(),controls={},b={username:'WaterTest',players:{},labOxygen:20,entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,yaw:-Math.PI/2},blockAt(p){p=p.floored();const key=p.toString(),wet=p.x>=3&&p.x<=6&&p.y>=61&&p.y<=63,name=cells.get(key)||(wet?'water':p.y<64?'stone':'air');return {position:p,name,boundingBox:['air','water','lava','bubble_column'].includes(name)?'empty':'block',getProperties:()=>({level:0})};},setControlState(k,v){controls[k]=v;},look:async()=>{}};
 return {b,cells,controls};
}
test('an accidental submerged entry keeps buoyancy while no surface route exists yet',async ctx=>{
 const {HutTeacher}=require('../controller/hut_teacher'),b=fixture().b,t=new HutTeacher(),goal=[10.5,64.1,.5];b.entity.isInWater=true;b.entity.onGround=false;
 ctx.mock.method(require('../controller/entrance_clearance'),'resume',async()=>null);
 t.navigator={status:{},portalFor:()=>null,plan:()=>({blocked:true,path:[],cue:goal})};let action,task;
 const motor={pause:()=>assert.fail('Pausing would clear buoyancy'),command(a,v){action=a;task=v;}};
 await t.walk(b,motor,goal,{world:{bounds:[-20,20,-20,20]}});assert.equal(action,4);assert.equal(task.water_route,true);
});

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

test('shallow runoff beside source water allows an escape but falling and deep currents do not',()=>{
 const {b}=fixture(),at=b.blockAt;
 b.blockAt=p=>{const v=at(p);if(p.y===62)return {...v,name:'stone',boundingBox:'block'};return v.name==='water'?{...v,getProperties:()=>({level:p.x===4?0:2})}:v;};
 b.entity.position=new Vec3(4.5,63.13,.5);b.entity.isInWater=true;b.entity.onGround=false;
 assert.equal(water.cell(b,4,63,0).mode,'wade');assert.equal(water.cell(b,5,63,0).mode,'wade');
 const goal=[10.5,64.1,.5],r=require('../controller/field_navigation').travelRoute(b,goal,20,4096,true,{bounds:[-2,13,-3,3]});
 assert.equal(r.reached,true);assert.equal(r.water_route,true);assert.equal(water.validRoute(b,r.path,goal),true);
 const shallow=b.blockAt;
 b.blockAt=p=>{const v=shallow(p);return v.name==='water'&&p.x===5?{...v,getProperties:()=>({level:8})}:v;};
 assert.equal(water.cell(b,4,63,0),null,'falling water beside the source is unsafe');
 b.blockAt=p=>p.y===62&&p.x===5?at(p):shallow(p);
 assert.equal(water.cell(b,4,63,0),null,'deep current beside the source is unsafe');
});

test('surface bobbing replans from the checked water below without accepting a dry airborne start',()=>{
 const {b}=fixture(),goal=[10.5,64.1,.5];b.entity.position=new Vec3(4.5,63.85,.5);b.entity.onGround=false;b.entity.isInWater=true;
 const r=route(b,goal,20,4096,true,{bounds:[-2,13,-3,3],allowWater:true});assert.equal(r.reached,true);assert.equal(water.validRoute(b,r.path,goal),true);
 b.entity.position=new Vec3(.5,65,.5);b.entity.isInWater=false;
 assert.equal(route(b,goal,20,4096,true,{allowWater:true}).waiting_for_ground,true);
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
 assert.match(motor.status(),/hold position in water/);
 motor.command(0,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0);motor.tick();assert.equal(controls.forward,true);
 // The teacher selects swim-up (5) beside a rising bank. Buoyancy without
 // forward travel cannot climb out, so this is a moving water intention.
 motor.command(5,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0);motor.tick();assert.equal(controls.forward,true);assert.equal(controls.jump,true);
 assert.match(motor.command(6,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0),/hold position in water/);motor.tick();assert.equal(controls.forward,false,'the displayed policy hold is not silently replaced by teacher travel');
 motor.command(4,{water_route:true,waypoints:[[4.5,63.1,.5]]},null,0);motor.tick();assert.equal(controls.forward,false);
 motor.pause();assert.equal(controls.forward,false);assert.equal(controls.jump,true);
});


test('water bobbing keeps a valid route and an airborne bank exit never points backward',()=>{
 const {b}=fixture(),n=new WorldNavigation(),goal=[10.5,64.1,.5],now=Date.now();
 b.entity.position=new Vec3(4.5,63.8,.5);b.entity.isInWater=true;b.entity.onGround=false;
 n.waterRoute=true;n.destination=goal.join(',');n.lastPlan=now-10000;n.progressAt=now-1000;n.best=20;n.anchor=[3.5,63.1,.5];n.path=[[5.5,63.1,.5],[6.5,63.1,.5],[7.5,64.1,.5],[10.5,64.1,.5]];
 let plan=n.plan(b,goal,{bounds:[-2,13,-3,3],now});assert.equal(n.replanned,false);assert.ok(plan.cue[0]>4.5);
 b.entity.position=new Vec3(6.7,64.2,.5);b.entity.isInWater=false;n.anchor=[5.5,63.1,.5];n.path=[[6.5,63.1,.5],[7.5,64.1,.5],[10.5,64.1,.5]];
 plan=n.plan(b,goal,{bounds:[-2,13,-3,3],now:now+100});assert.ok(plan.cue[0]>=7.5);
});


test('a stalled water route releases its lock so new obstacles and nearby players can be routed around',()=>{
 const {b}=fixture(),n=new WorldNavigation(),goal=[10.5,64.1,.5],now=Date.now();
 b.entity.position=new Vec3(4.5,63.8,.5);b.entity.isInWater=true;b.entity.onGround=false;
 n.waterRoute=true;n.destination=goal.join(',');n.lastPlan=now-10000;n.progressAt=now-3000;n.best=20;n.anchor=[3.5,63.1,.5];n.path=[[5.5,63.1,.5],[6.5,63.1,.5],[7.5,64.1,.5],[10.5,64.1,.5]];
 n.plan(b,goal,{bounds:[-2,13,-3,3],now});assert.equal(n.replanned,true,'bobbing cannot pin a stalled route indefinitely');
});


test('a swimmer returning to unloaded home first takes a verified dry-shore prefix',()=>{
 const {b}=fixture(),at=b.blockAt;b.blockAt=p=>p.x>=13?null:at(p);b.entity.position=new Vec3(4.5,63,.5);b.entity.isInWater=true;b.entity.onGround=false;
 const goal=[100.5,64.1,.5],n=new WorldNavigation(),plan=n.plan(b,goal,{bounds:[-2,110,-3,3]});
 assert.equal(plan.blocked,false);assert.equal(plan.arrived,false);assert.equal(plan.water_route,true);assert.equal(n.status.partial_route,true);assert.ok(plan.path.length<=12);
 const shore=plan.path.at(-1);assert.equal(water.cell(b,Math.floor(shore[0]),Math.round(shore[1]),Math.floor(shore[2])).wet,false);assert.equal(water.validRoute(b,plan.path,shore),true);
});

test('an unloaded distant home never turns an all-water prefix into a completed crossing',()=>{
 const {b}=fixture();b.entity.position=new Vec3(4.5,63,.5);b.entity.isInWater=true;b.entity.onGround=false;
 b.blockAt=p=>{p=p.floored();if(p.x>=13||p.x<0||Math.abs(p.z)>2)return null;const name=p.y>=61&&p.y<=63?'water':p.y<61?'stone':'air';return {position:p,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 const n=new WorldNavigation(),plan=n.plan(b,[100.5,64.1,.5],{bounds:[-2,110,-3,3]});assert.equal(plan.blocked,true);assert.equal(plan.arrived,false);assert.equal(n.status.partial_route,false);
});

test('a loaded bank beyond a bounded search advances only a short checked dry-ending prefix',()=>{
 const {b}=fixture();
 b.blockAt=p=>{p=p.floored();const name=p.x===50?'lava':p.x===101&&p.y===63?'water':p.y<64?'stone':'air';return {position:p,name,boundingBox:['air','water','lava'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 const goal=[100.5,64.1,.5],n=new WorldNavigation(),plan=n.plan(b,goal,{bounds:[-100,110,-100,100]});
 assert.equal(standable(b,100,64,0),false,'bank is valid for travel but not dry work');assert.equal(water.cell(b,100,64,0).wet,false);
 assert.equal(plan.blocked,false);assert.equal(plan.arrived,false);assert.equal(n.status.partial_route,true);assert.ok(plan.path.length<=12);
 const end=plan.path.at(-1);assert.ok(end[0]<50,'the prefix cannot cross the lava barrier');assert.equal(water.validRoute(b,plan.path,end),true);
 // A known obstructed destination never qualifies for this search-budget fallback.
 const at=b.blockAt;b.blockAt=p=>Math.floor(p.x)===100&&Math.floor(p.z)===0&&Math.floor(p.y)===64?{...at(p),name:'stone',boundingBox:'block'}:at(p);
 assert.equal(new WorldNavigation().plan(b,goal,{bounds:[-100,110,-100,100]}).blocked,true);
});

test('construction goal selection preserves a checked partial return to a loaded distant bank',async()=>{
 const {b}=fixture();b.blockAt=p=>{p=p.floored();const name=p.x===50?'lava':[98,101].includes(p.x)&&p.y===63?'water':p.y<64?'stone':'air';return {position:p,name,boundingBox:['air','water','lava'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 const t={run:'partial-construction',plot:{x:100,y:64,z:5},campPlots:[],walk:async()=>undefined},state={run:'partial-construction',world:{bounds:[-100,110,-100,100]}},floor=require('../controller/floor_builder');
 const goal=floor.returnTarget(t,b,state,'plotReturnGoal');assert.deepEqual(goal,[100.5,64.1,.5]);
 const plan=new WorldNavigation().plan(b,goal,{plot:t.plot,bounds:state.world.bounds,constructionWork:true});assert.equal(plan.arrived,false);assert.equal(plan.blocked,false);
 assert.equal(await require('../controller/plot_clearance').tick(t,b,{pause(){}},state),false,'checked travel never completes plot clearing remotely');
 assert.deepEqual(t.plotReturnGoal,goal);assert.equal(t.plotClearing.removed,0);
});

test('a bounded checked return can begin sideways when its searched frontier makes real progress',()=>{
 const {b}=fixture();b.blockAt=p=>{p=p.floored();const wall=(p.z===-1&&p.x>=-14||p.z===-90)&&p.y>=64&&p.y<=68,name=wall?'stone':p.x===1&&p.z<=-95&&p.y===63?'water':p.y<64?'stone':'air';return {position:p,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};};
 const goal=[.5,64.1,-100.5],bounds=[-100,110,-110,100],searched=route(b,goal,192,8192,true,{bounds,reversible:true,allowWater:true});
 assert.equal(searched.budget_exhausted,true);assert.equal(searched.reached,false);assert.ok(searched.path.at(-1)[2]<-80);
 const n=new WorldNavigation(),plan=n.plan(b,goal,{bounds});assert.equal(plan.blocked,false);assert.equal(plan.arrived,false);assert.equal(n.status.partial_route,true);assert.ok(plan.path.length<=12);
 const end=plan.path.at(-1);assert.ok(Math.hypot(goal[0]-end[0],goal[2]-end[2])>101,'this necessary initial leg moves away from the destination');assert.equal(water.validRoute(b,plan.path,end),true);
});

for(const plant of ['seagrass','tall_seagrass','kelp','kelp_plant'])test('swimming through '+plant+' retains water classification, air checks and dry-footing restrictions',()=>{
 const {b,cells}=fixture(),at=b.blockAt;b.blockAt=p=>{const v=at(p);if(p.floored().x===4&&p.floored().z===0&&p.floored().y===63)return {...v,name:plant,boundingBox:'empty',shapes:[],getProperties:()=>({half:'upper'})};return v;};
 b.entity.position=new Vec3(4.5,63.85,.5);b.entity.isInWater=true;b.entity.onGround=false;
 assert.equal(water.cell(b,4,63,0).wet,true);assert.equal(standable(b,4,63,0),false);
 const goal=[10.5,64.1,.5],r=route(b,goal,20,4096,true,{bounds:[-2,13,-3,3],allowWater:true});assert.equal(r.reached,true);assert.equal(water.validRoute(b,r.path,goal),true);
 cells.set(new Vec3(4,64,0).toString(),'water');assert.equal(water.cell(b,4,63,0),null,'underwater head space is not surface air');
 cells.delete(new Vec3(4,64,0).toString());b.entity.isInWater=false;b.labOxygen=3;assert.equal(water.cell(b,4,63,0),null,'low-air entry guard still applies');
});
test('waterlogged solid blocks and bubble columns are not treated as harmless aquatic plants',()=>{
 const {b}=fixture(),at=b.blockAt;b.blockAt=p=>Math.floor(p.x)===4&&Math.floor(p.y)===63?{...at(p),name:'oak_leaves',getProperties:()=>({waterlogged:true})}:at(p);
 assert.equal(water.cell(b,3,63,0),null);assert.equal(water.isWater(b.blockAt(new Vec3(4,63,0))),false);assert.equal(water.isWater({name:'bubble_column',boundingBox:'empty'}),false);
});

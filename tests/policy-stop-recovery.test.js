const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{proximity}=require('../controller/perception'),{route}=require('../controller/field_navigation'),space=require('../controller/resource_space'),{secureInterior}=require('../controller/hut_teacher');
function ledge(){return {players:{},entity:{position:new Vec3(.5,67,1.148),yaw:0,onGround:true},blockAt(p){p=p.floored();const solid=p.z<=0&&p.y<67;return {name:solid?'dirt':'air',position:p,boundingBox:solid?'block':'empty'};}};}
test('a grounded partial overhang can regain full footing but cannot move farther out',()=>{
 const b=ledge(),s=proximity(b);assert.equal(s.canWalk(0,.35),false);assert.equal(s.canRegainFooting(0,.648),true);
 assert.equal(s.canRegainFooting(Math.PI,.648),false);b.entity.onGround=false;assert.equal(proximity(b).canRegainFooting(0,.648),false);
});
test('regaining footing still rejects fluids, unknown blocks and obstructed headroom',()=>{
 for(const kind of ['water','unknown','ceiling']){
  const b=ledge(),base=b.blockAt;b.blockAt=p=>{const q=p.floored();if(kind==='water'&&q.z===1&&q.y===66)return {name:'water',position:q,boundingBox:'empty'};if(kind==='unknown'&&q.z===1&&q.y===66)return null;if(kind==='ceiling'&&q.z===0&&q.y===68)return {name:'stone',position:q,boundingBox:'block'};return base(p);};
  assert.equal(proximity(b).canRegainFooting(0,.648),false,kind);
 }
});
test('centering a route start cannot move into another player clearance zone',()=>{
 const other=new Vec3(1.71,65,-.75),b={username:'self',players:{other:{username:'other',gamemode:0,entity:{id:2,position:other}}},entity:{id:1,position:new Vec3(.26,64,.97),onGround:true},blockAt(p){const q=p.floored(),floor=q.z<=0?64:63;return {position:q,name:q.y<floor?'stone':'air',boundingBox:q.y<floor?'block':'empty'};}};
 const r=route(b,[-4.5,64.1,-.5],16,2048,true,{reversible:true});assert.equal(r.reached,true);
 assert.ok(r.path.length);assert.equal(space.stepClear(b.entity.position,{x:r.path[0][0],y:r.path[0][1],z:r.path[0][2]},[other],2),true);
 assert.notDeepEqual(r.path[0].slice(0,3),[.5,64.1,.5]);
});
test('secure shelter accepts a full body inside the room, excluding door threshold and airborne poses',()=>{
 const b={entity:{position:new Vec3(.95,65,.73),onGround:true}},plot={x:0,y:65,z:0};assert.equal(secureInterior(b,plot),true);
 b.entity.position.z=-2;assert.equal(secureInterior(b,plot),false);b.entity.position.z=.5;b.entity.onGround=false;assert.equal(secureInterior(b,plot),false);
});
test('turning toward a clear route is not preempted by a wall in the old view',()=>{
 const {createMotor}=require('../controller/locomotion'),controls={},b={entity:{position:new Vec3(.5,64,.5),yaw:0,pitch:0,onGround:true},getControlState:k=>controls[k],setControlState:(k,v)=>controls[k]=v};
 const motor=createMotor(b,{move:true,turn:true,jump:true}),task={kind:'expedition',safe_walk:true,strict_ground:true,waypoints:[[1.5,64.1,.5]],safety_focus:[1.5,64.1,.5]};
 const label=motor.command(2,task,{wallAhead:true,frontBlocked:false,headBlocked:false,canWalk:()=>true,canStepDown:()=>true},-.3);
 assert.ok(!label?.includes('Wall ahead'));assert.equal(motor.diagnostic().recovering,false);
});

test('a policy waiting safely inside still needs a closed intact hut and the three-second hold',async()=>{
 const {HutTeacher,blueprint}=require('../controller/hut_teacher'),plot={x:0,y:65,z:0};
 const blocks=new Map(blueprint(plot).map(q=>[[q.x,q.y,q.z].join(','),q.table?'crafting_table':'oak_planks']));let doorOpen=false;
 const b={username:'LabAI0',game:{gameMode:'survival'},health:20,food:20,entities:{},inventory:{items:()=>[]},entity:{position:new Vec3(.95,65,.73),onGround:true,yaw:0},
 blockAt(p){p=p.floored();const door=p.x===0&&p.y===65&&p.z===-3,name=door?'oak_door':blocks.get([p.x,p.y,p.z].join(','))||(p.y<65?'stone':'air');return {position:p,name,boundingBox:name==='air'?'empty':'block',getProperties:()=>({open:doorOpen,half:'lower'})};}};
 const t=new HutTeacher(),motor={pause(){},lockLook(){}},state={run:'secure-test',world:{bounds:[-30,30,-30,30],mission:'hut'}},api=async()=>({});
 await t.tick(b,motor,state,api,null,{createRuntime:()=>({})});t.phase='enter';t.plot=plot;t.settle=0;
 await t.tick(b,motor,state,api,null,null);assert.equal(t.phase,'shelter');assert.deepEqual(t.milestones,[]);
 t.secureAt=Date.now()-2000;await t.tick(b,motor,state,api,null,null);assert.equal(t.phase,'shelter');
 t.secureAt=Date.now()-3100;await t.tick(b,motor,state,api,null,null);assert.equal(t.phase,'complete');assert.ok(t.milestones.includes('hut'));
 t.phase='shelter';t.milestones=[];t.secureAt=Date.now()-3100;doorOpen=true;
 await t.tick(b,motor,state,api,null,null);assert.equal(t.phase,'stopped');assert.deepEqual(t.milestones,[]);
});

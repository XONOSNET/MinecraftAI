const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),waterWork=require('../controller/water_work');
function fixture(phase='craft'){
 const b={entity:{position:new Vec3(.5,63.2,.5),onGround:false,isInWater:true},blockAt(p){const q=p.floored(),name=q.y<63?'stone':q.y===63?(q.x>=3?'dirt':'water'):'air';return {position:q,name,boundingBox:['water','air'].includes(name)?'empty':'block',getProperties:()=>({level:0})};}};
 const calls=[],t={phase,plot:{x:12,y:64,z:12},campPlots:[],lastProgress:123,tree:'4,5',walk:async(...args)=>{calls.push(args[2]);}};
 const commands=[],motor={command:(...args)=>commands.push(args)},state={run:'shared-water',world:{bounds:[-16,16,-16,16]}};
 return {b,t,motor,state,calls,commands};
}
for(const phase of ['gather','craft','build','floor','night_stone','night_food','night_wool','night_fuel','return_home','stone_return','night_recover'])test(phase+' reaches checked footing before ordinary work',async()=>{
 const f=fixture(phase);assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),true);assert.equal(f.calls.length,1);assert.equal(f.t.phase,phase);assert.equal(f.t.lastProgress,123);assert.equal(f.t.tree,'4,5');
 f.b.entity.position=new Vec3(3.5,64.1,.5);f.b.entity.isInWater=false;f.b.entity.onGround=true;
 assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.t.waterWork,null);assert.equal(f.t.phase,phase);
});
test('healthy checked crossing preserves the original destination and policy-driven walk',async()=>{
 const f=fixture();f.t.waterTravel={run:f.state.run,phase:'craft',goal:[9.5,64.1,.5],at:100};
 await waterWork.tick(f.t,f.b,f.motor,f.state,null,null,null,{now:200});assert.deepEqual(f.calls[0],[9.5,64.1,.5]);assert.equal(f.t.lastNavigation.water_work.checked_travel,true);
 await waterWork.tick(f.t,f.b,f.motor,f.state,null,null,null,{now:4000});assert.deepEqual(f.calls[1],f.calls[0]);
});
test('stale travel from another phase or run does not pin accidental entry',async()=>{
 for(const travel of [{run:'old',phase:'craft'},{run:'shared-water',phase:'gather'},{run:'shared-water',phase:'craft'}]){
 const f=fixture();f.t.waterTravel={...travel,goal:[9.5,64.1,.5],at:0};await waterWork.tick(f.t,f.b,f.motor,f.state,null,null,null,{now:3000});assert.notDeepEqual(f.calls[0],[9.5,64.1,.5]);
 }
});
test('threat retreat, burrow ownership and terminal states retain priority',async()=>{
 for(const phase of ['night_seek_cover','night_retreat','night_burrow','stopped','complete','survey']){const f=fixture(phase);assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),false);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state,null,null,null,{urgent:true}),false);f.t.wilderness={burrow:{}};assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),false);
});
test('airborne dry jumps do not become water recovery',async()=>{const f=fixture();f.b.entity.position=new Vec3(4.5,65,.5);f.b.entity.isInWater=false;assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),false);});
test('shore search respects other private plots and waits buoyantly without an exit',async()=>{
 const f=fixture();f.t.campPlots=[{x:3,y:64,z:0}];await waterWork.tick(f.t,f.b,f.motor,f.state);const g=f.calls[0];assert.ok(g);assert.equal(require('../controller/world_navigation').privatePlotCell(g,f.t.campPlots[0]),false);
 const n=fixture();n.b.blockAt=p=>({position:p.floored(),name:p.y<=63?'water':'air',boundingBox:'empty',getProperties:()=>({level:0})});await waterWork.tick(n.t,n.b,n.motor,n.state);assert.equal(n.calls.length,0);assert.equal(n.commands[0][0],4);assert.equal(n.t.lastProgress,123);
});
test('premature navigation arrival while wet keeps buoyancy and releases that goal',async()=>{const f=fixture();f.t.walk=async()=>true;await waterWork.tick(f.t,f.b,f.motor,f.state);assert.equal(f.t.waterWork.goal,null);assert.equal(f.commands[0][0],4);});

test('shore recovery retains the climb after leaving water until grounded',async()=>{
 const f=fixture();await waterWork.tick(f.t,f.b,f.motor,f.state);const goal=f.calls[0];
 f.b.entity.isInWater=false;f.b.entity.position=new Vec3(2.8,64.1,.5);
 assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),true);assert.deepEqual(f.calls[1],goal);
 f.b.entity.position=new Vec3(3.5,64.1,.5);f.b.entity.onGround=true;assert.equal(await waterWork.tick(f.t,f.b,f.motor,f.state),false);
});

test('survival interruption does not pause water travel to eat or replace tools',async()=>{
 const f=fixture();f.t.wilderness={};f.t.milestones=[];f.b.health=20;f.b.food=10;f.b.inventory={items:()=>[{name:'apple',count:1}]};
 f.b.consume=()=>{throw Error('Eating must wait for footing');};f.motor.pause=()=>{throw Error('Dry work must not pause the swim');};
 assert.equal(await require('../controller/first_night').interrupt(f.t,f.b,f.motor,f.state),true);assert.equal(f.calls.length,1);assert.equal(f.t.phase,'craft');assert.equal(f.t.lastProgress,123);
});

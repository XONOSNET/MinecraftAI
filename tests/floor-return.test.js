const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),floor=require('../controller/floor_builder'),{route,standable}=require('../controller/field_navigation');
function fixture(){
 const cells=new Map(),b={username:'Builder',players:{},entity:{position:new Vec3(-10.5,64,.5),onGround:true},blockAt(p){p=p.floored();const name=cells.get(p.toString())||(p.y<64?'grass_block':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block'};}};
 const t={plot:{x:0,y:64,z:0},campPlots:[]},state={world:{bounds:[-30,30,-30,30]}};return {b,t,state,cells};
}
test('unfinished-floor return uses reachable plot ground when its front approach is blocked',()=>{
 const {b,t,state,cells}=fixture();for(let y=64;y<68;y++)cells.set(new Vec3(0,y,-5).toString(),'stone');
 const goal=floor.returnGoal(t,b,state);assert.ok(goal);assert.ok(Math.abs(goal[0]-.5)<=2&&Math.abs(goal[2]-.5)<=2);
 assert.equal(route(b,goal,48,8192,true,{bounds:state.world.bounds,reversible:true}).reached,true);
});
test('return stances never nominate a dug floor hole',()=>{
 const {b,t,state,cells}=fixture();for(let y=64;y<68;y++)cells.set(new Vec3(0,y,-5).toString(),'stone');
 for(const [x,z] of [[-2,-2],[-2,2],[2,-2],[2,2]])cells.set(new Vec3(x,63,z).toString(),'air');
 const goal=floor.returnGoal(t,b,state);assert.deepEqual(goal,[.5,64.1,.5]);assert.equal(standable(b,0,64,0),true);
});
test('neighboring private plots are excluded while selecting an unfinished-floor return',()=>{
 const {b,t,state}=fixture();t.campPlots=[{x:0,y:64,z:0},{x:0,y:64,z:-5}];const goal=floor.returnGoal(t,b,state);
 assert.ok(goal);assert.ok(goal[2]>-2);assert.equal(standable(b,Math.floor(goal[0]),64,Math.floor(goal[2])),true);
});

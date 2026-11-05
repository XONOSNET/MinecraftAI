const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{HutTeacher}=require('../controller/hut_teacher');
function fixture(){
 const b={username:'PickupSwim',players:{},entity:{position:new Vec3(.5,63.2,.5),onGround:false,isInWater:true},blockAt(p){const q=p.floored(),bank=q.x>=3,name=q.y<63?'stone':q.y===63?(bank?'dirt':'water'):q.y===65&&q.x>=3&&q.z>=0?'oak_leaves':'air';return {position:q,name,boundingBox:['air','water'].includes(name)?'empty':'block',getProperties:()=>({level:0})};}};
 const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:{x:12,y:64,z:12},campPlots:[],lastProgress:123});
 return {t,b,state:{run:'swim-pickup',world:{bounds:[-16,16,-16,16]}},drop:{id:7,position:new Vec3(3.5,64,.5)}};
}
test('wood pickup routes around leaf-covered banks instead of waiting for water to land',async()=>{
 const f=fixture();let goal;f.t.walk=async(_b,_m,g)=>{goal=g;};
 await f.t.collectWood(f.b,{pause(){throw Error('A float must not be paused as a landing');}},f.drop,f.state);
 assert.ok(goal);assert.equal(require('../controller/water_navigation').cell(f.b,Math.floor(goal[0]),Math.round(goal[1]),Math.floor(goal[2])).wet,false);
 assert.ok(goal[2]<0,'clear shore beyond the canopy is selected');assert.equal(f.t.phase,'gather');assert.equal(f.t.lastProgress,123);assert.equal(f.t.harvested,undefined);
});
test('unavailable shore keeps buoyancy and retries without inventing an exit',async()=>{
 const f=fixture();f.b.blockAt=p=>({position:p.floored(),name:p.y<=63?'water':'air',boundingBox:'empty',getProperties:()=>({level:0})});let command;
 await f.t.collectWood(f.b,{command:(action,task)=>command={action,task}},f.drop,f.state);
 assert.equal(command.action,4);assert.equal(command.task.water_route,true);assert.equal(f.t.woodShore.goal,null);assert.equal(f.t.lastProgress,123);
});

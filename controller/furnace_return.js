// Shelter recovery resumes the task, but its workstation may be far away.
const house=require('./house'),{insideHome}=require('./world_navigation');
async function tick(t,b,motor,state,api,scan,tasks){
 const station=['night_light_tools','stone_tools'].includes(t.phase)?'table':['smelt','night_cook'].includes(t.phase)?'furnace':null;
 if(!station||!t.plot)return false;
 const target=house.point(t.plot,station).offset(.5,.5,.5);
 if(insideHome(b.entity.position,t.plot)&&target.distanceTo(b.entity.position.offset(0,b.entity.eyeHeight||1.62,0))<4)return false;
 await t.walk(b,motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],state,api,scan,tasks);
 t.message=station==='table'?'Returning to the workbench before resuming '+(t.phase==='stone_tools'?'stone tools':'lighting tools'):'Returning to the furnace before resuming '+(t.phase==='smelt'?'charcoal preparation':'cooking');
 return true;
}
module.exports={tick};

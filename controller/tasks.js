const {Vec3}=require('vec3');
const HAZARDS=new Set(['water','lava','magma_block','fire','campfire']);
const count=(bot,name)=>bot.inventory.items().filter(i=>i.name===name).reduce((n,i)=>n+i.count,0);
function solid(block){return !!block&&block.boundingBox==='block';}
function cell(p){return `${Math.floor(p.x/2)},${Math.floor(p.z/2)}`;}
function createRuntime(){return {visited:new Map(),eaten:0,hungerObserved:false,hazardContacts:0,waypoint:0,openedDoors:new Set()};}
function observeTask(bot,task,scan,runtime){
 const p=bot.entity.position,yaw=bot.entity.yaw,forward=new Vec3(-Math.sin(yaw),0,-Math.cos(yaw)),left=new Vec3(-Math.cos(yaw),0,Math.sin(yaw));
 const at=(dir,height,distance=1.4)=>bot.blockAt(new Vec3(p.x+dir.x*distance,Math.floor(p.y)+height,p.z+dir.z*distance));
 const probeDistances=[.35,.7,1.1,1.4];
 const lowBlocked=probeDistances.some(d=>solid(at(forward,0,d))),headBlocked=probeDistances.some(d=>solid(at(forward,1,d))),below=at(forward,-1);
 const unsafe=dir=>{const foot=at(dir,-1);return !foot||foot.boundingBox==='empty'||HAZARDS.has(foot.name)||solid(at(dir,0));};
 const frontHazard=!below||below.boundingBox==='empty'||HAZARDS.has(below.name);
 const leftUnsafe=unsafe(left),rightUnsafe=unsafe(left.scaled(-1));
 const key=cell(p);runtime.visited.set(key,(runtime.visited.get(key)||0)+1);
 if(bot.food<18)runtime.hungerObserved=true;
 const standing=bot.blockAt(p.offset(0,-.1,0));
 if(bot.entity.isInWater||(bot.entity.onGround&&standing?.name==='magma_block'))runtime.hazardContacts++;
 let sheltered=false;for(let h=2;h<=6;h++){const block=bot.blockAt(p.offset(0,h,0));if(solid(block)){sheltered=true;break;}}
 const resource=scan.hits.filter(h=>h.name==='oak_log'&&h.distance<=3.6).map(h=>bot.blockAt(new Vec3(h.position.x,h.position.y,h.position.z))).filter(b=>b&&bot.canSeeBlock(b)).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p))[0]||null;
 let door=null;for(const [x,z] of task.actual_doors||[]){const b=bot.blockAt(new Vec3(x,181,z));if(b?.name==='oak_door'){
  if(b.getProperties().open)runtime.openedDoors.add(`${x},${z}`);
  else for(const part of [b,bot.blockAt(new Vec3(x,182,z))]){
   // At close range the upper half can occlude the lower half from the player's eyes.
   if(part?.name==='oak_door'&&!part.getProperties().open&&part.position.offset(.5,.5,.5).distanceTo(p)<2.6&&bot.canSeeBlock(part)){door=part;break;}
  }
 }}
 const prior=runtime.motionPosition;
 runtime.blockedSteps=prior&&p.distanceTo(prior)<.05&&[0,3].includes(runtime.lastAction)?(runtime.blockedSteps||0)+1:0;
 runtime.motionPosition=p.clone();
 // Brief steering corrections must not reset the no-progress deadline indefinitely.
 if(!runtime.progressAnchor||p.distanceTo(runtime.progressAnchor)>=.5){runtime.progressAnchor=p.clone();runtime.stalledSteps=0;}
 else runtime.stalledSteps=(runtime.stalledSteps||0)+1;
 const wood=count(bot,'oak_log'),food=count(bot,'bread');
 const visited=dir=>Math.min(1,(runtime.visited.get(cell(p.plus(dir.scaled(2))))||0)/10);
 const extra=[Number(lowBlocked),Number(headBlocked),Number(frontHazard),Number(leftUnsafe),Number(rightUnsafe),task.kind==='advanced'?Number(!!door):Math.min(wood/3,1),Math.min(food/6,1),Number(sheltered),visited(forward),visited(left),visited(left.scaled(-1)),Math.min(runtime.visited.size/task.coverage_target,1)];
 const distance=Math.hypot(task.goal[0]-p.x,task.goal[2]-p.z);
 const inside=p.x>task.bounds[0]&&p.x<task.bounds[1]&&p.z>task.bounds[2]&&p.z<task.bounds[3];
 const metrics={blocked_steps:runtime.blockedSteps,stalled_steps:runtime.stalledSteps,doors_opened:runtime.openedDoors.size,health:bot.health,food:bot.food,wood,eaten:runtime.eaten,hunger_observed:runtime.hungerObserved,coverage:runtime.visited.size,sheltered,distance,y:p.y,hazard_contacts:runtime.hazardContacts,inside};
 return {extra,metrics,resource,door,frontBlocked:lowBlocked,headBlocked,frontHazard,leftUnsafe,rightUnsafe,forward,left};
}
function failed(task,m){return task.kind==='advanced'&&(m.hazard_contacts>0||m.blocked_steps>=32||m.stalled_steps>=64);}
function reached(task,m){
 if(m.health<=0||!m.inside||Math.abs(m.y-181)>1.5)return false;
 if(task.kind==='gather')return m.wood>=task.wood_target;
 if(['eat','eat_route'].includes(task.kind))return m.food>=(task.food_target||18)&&m.eaten>=1&&m.hunger_observed&&(task.kind==='eat'||m.distance<1.25);
 if(task.kind==='explore')return m.coverage>=task.coverage_target;
 if(task.kind==='shelter')return m.sheltered&&m.distance<3;
 if(task.kind==='advanced'&&m.doors_opened<(task.actual_doors?.length||0))return false;
 return m.distance<1.25&&m.health>=18&&m.hazard_contacts===0;
}
// Both controllers receive the same route checkpoint; the neural policy still chooses every action.
function navigationTarget(bot,task,runtime){
 if(!task.waypoints?.length)return task.goal;
 const p=bot.entity.position;let point=task.waypoints[runtime.waypoint];
 while(Math.hypot(point[0]-p.x,point[2]-p.z)<1&&runtime.waypoint<task.waypoints.length-1)point=task.waypoints[++runtime.waypoint];
 return point;
}
function turnAction(angle){return Math.abs(angle)>.18?(angle>0?1:2):0;}
function teacherAction(bot,task,sensed,runtime,angle){
 if(['eat','eat_route'].includes(task.kind)&&bot.food<(task.food_target||18)&&sensed.extra[6]>0)return 6;
 if(task.kind==='advanced'&&sensed.door)return 5;
 if(task.kind==='eat')return 4;
 if(task.kind==='gather'&&sensed.resource)return 5;
 if(task.kind==='gather'&&sensed.metrics?.distance<3.5){
  runtime.searchDecision=(runtime.searchDecision||0)+1;
  if(runtime.searchDecision%4!==0)return 5;
 }
 if(task.kind==='explore'){
  // Follow open ground, turning consistently at a boundary rather than oscillating.
  return sensed.frontBlocked||sensed.frontHazard?1:0;
 }
 if(task.waypoints?.length>1){
  const point=navigationTarget(bot,task,runtime),p=bot.entity.position;
  const target=Math.atan2(-(point[0]-p.x),-(point[2]-p.z));angle=Math.atan2(Math.sin(target-bot.entity.yaw),Math.cos(target-bot.entity.yaw));
 }
 const action=task.kind==='advanced'?(Math.abs(angle)>.08?(angle>0?1:2):0):turnAction(angle);
 if(action===0&&['jump','mixed','terrain','advanced'].includes(task.kind)&&sensed.frontBlocked&&!sensed.headBlocked)return 3;
 return action;
}
function inPracticeBounds(bot,task){const p=bot.entity.position;return p.x>task.bounds[0]&&p.x<task.bounds[1]&&p.z>task.bounds[2]&&p.z<task.bounds[3]&&p.y>=179&&p.y<=186;}
async function interact(bot,task,sensed,runtime,action,permissions={}){
 if(!task||!inPracticeBounds(bot,task))return false;
 if(action===5&&task.kind==='advanced'&&permissions.open_practice_doors&&sensed.door){const b=sensed.door;if(b.name!=='oak_door'||![181,182].includes(b.position.y)||!task.actual_doors.some(([x,z])=>b.position.x===x&&b.position.z===z)||!bot.canSeeBlock(b)||b.getProperties().open)return false;await bot.activateBlock(b);await bot.look(bot.entity.yaw,0,true);return true;}
 if(action===5&&permissions.harvest_oak_logs&&task.kind==='gather'){
  if(!sensed.resource){
   const pitches=[-.7,0,.7];runtime.lookSweep=(runtime.lookSweep||0)+1;
   await bot.look(bot.entity.yaw,pitches[(runtime.lookSweep-1)%pitches.length],true);return true;
  }
  const b=sensed.resource;if(b.name!=='oak_log'||!bot.canDigBlock(b)||!bot.canSeeBlock(b))return false;
  if(b.position.x<task.bounds[0]||b.position.x>task.bounds[1]||b.position.z<task.bounds[2]||b.position.z>task.bounds[3])return false;
  await bot.lookAt(b.position.offset(.5,.5,.5),true);await bot.dig(b);
  // Return the harvesting actuator to its normal forward gaze between blocks.
  await bot.look(bot.entity.yaw,0,true);return true;
 }
 if(action===6&&permissions.eat_bread&&['eat','eat_route'].includes(task.kind)&&bot.food<20){
  const food=bot.inventory.items().find(i=>i.name==='bread');if(!food)return false;
  const before=count(bot,'bread');await bot.equip(food,'hand');await bot.consume();runtime.eaten+=Math.max(0,before-count(bot,'bread'));return true;
 }
 return false;
}
module.exports={failed,navigationTarget,createRuntime,observeTask,reached,teacherAction,interact,inPracticeBounds};

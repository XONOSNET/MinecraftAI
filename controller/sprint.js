// Conservative sprint assistance; this does not add a neural action or change saved weights.
const {Vec3}=require('vec3');
const UNSAFE=new Set(['lava','water','magma_block','fire','campfire','sweet_berry_bush','ice','packed_ice','blue_ice','soul_sand','soul_soil','honey_block','slime_block','mud','cobweb','powder_snow']);
const ALLOWED=new Set(['explore','gather','eat_route','shelter','combat']);
function routeRunway(bot,task){
 if(!task?.travel_sprint||!Array.isArray(task.sprint_path))return 0;
 const p=bot.entity.position,yaw=bot.entity.yaw;let length=0,previous=p;
 for(const q of task.sprint_path){
  const dx=q[0]-previous.x,dz=q[2]-previous.z,d=Math.hypot(dx,dz);
  if(Math.abs(q[1]-p.y)>.2)break;
  if(d<.05)continue;
  if(previous===p&&d<.4)continue;
  if((-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/d<.99)break;
  length+=d;previous={x:q[0],y:q[1],z:q[2]};
 }
 return length;
}
function basicSprintSafe(bot){return bot.entity?.onGround===true&&!bot.entity.isInWater&&!bot.entity.isInLava&&bot.food>=8&&!bot.getControlState('sneak');}
function flatSprintPath(bot,task){
 if(!bot.blockAt||!bot.entity?.position)return false;
 const p=bot.entity.position,yaw=bot.entity.yaw;
 for(const d of [.75,1.5,2.25,3])for(const dx of [-.3,.3])for(const dz of [-.3,.3]){
  const x=p.x-Math.sin(yaw)*d+dx,z=p.z-Math.cos(yaw)*d+dz;
  if(task?.bounds&&(x<=task.bounds[0]+.4||x>=task.bounds[1]-.4||z<=task.bounds[2]+.4||z>=task.bounds[3]-.4))return false;
  const ground=bot.blockAt(new Vec3(Math.floor(x),Math.floor(p.y-.05),Math.floor(z)));
  if(!ground||UNSAFE.has(ground.name))return false;
  const at=ground.position||new Vec3(Math.floor(x),Math.floor(p.y-.05),Math.floor(z));
  const supported=(ground.shapes||(ground.boundingBox==='block'?[[0,0,0,1,1,1]]:[])).some(s=>x-at.x>=s[0]&&x-at.x<=s[3]&&z-at.z>=s[2]&&z-at.z<=s[5]&&Math.abs(at.y+s[4]-p.y)<.04);
  if(!supported)return false;
 }
 return true;
}
function sprintIntent(bot,permissions,task,plan,sensed,angle,already=false){
 const travel=task?.kind==='expedition'&&task.travel_sprint===true;
 if(!permissions.sprint||!permissions.move||!plan.forward||plan.back||plan.jump||plan.sneak||plan.yaw||plan.moveTarget||plan.targetYaw!==undefined||plan.label&&!(travel&&plan.label==='Following locked route'))return false;
 if(task&&!ALLOWED.has(task.kind)&&!travel)return false;
 if(!basicSprintSafe(bot)||Math.abs(angle)>.12||sensed?.wallAhead||sensed?.frontBlocked||sensed?.headBlocked||sensed?.frontHazard||sensed?.crouchClearance||sensed?.doorway||sensed?.door)return false;
 const minimum=already?4.5:6;
 const distance=travel?routeRunway(bot,task):sensed?.cueDistance;
 if(!Number.isFinite(distance)||distance<minimum||travel&&bot.food<12)return false;
 if(task?.kind==='combat'&&(!sensed.enemy||sensed.distance<6||!sensed.gear?.ready))return false;
 if(!sensed.canWalk?.(bot.entity.yaw,3,1.79))return false;
 return flatSprintPath(bot,task);
}
module.exports={sprintIntent,flatSprintPath,basicSprintSafe,routeRunway};

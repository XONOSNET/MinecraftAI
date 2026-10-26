// Auxiliary acquisition sensor; real ray hits cannot see through walls.
const {Vec3}=require('vec3');
function scanTrees(bot,range=32){
 const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0),found=new Map();
 for(let sector=0;sector<24;sector++)for(const pitch of [-.22,0,.22]){
  const yaw=bot.entity.yaw+sector*Math.PI/12;
  const direction=new Vec3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const hit=bot.world.raycast(eye,direction,range);
  if(hit?.name.endsWith('_log'))found.set(hit.position.x+','+hit.position.z,hit.position.clone());
 }
 return [...found.values()];
}
function visibleBlock(bot,block){
 if(!block)return false;
 const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0),delta=block.position.offset(.5,.5,.5).minus(eye),distance=delta.norm();
 if(!distance)return true;
 const hit=bot.world.raycast(eye,delta.scaled(1/distance),distance+.05);
 return !!hit?.position.equals(block.position);
}
module.exports={scanTrees,visibleBlock};

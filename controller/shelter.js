// Verify the cabin itself, rather than interpreting any overhead block as protection.
const {Vec3}=require('vec3');
function state(bot,task,runtime,now=Date.now()){
 const [lo,hi,zlo,zhi]=task.shelter_box,[dx,dz]=task.shelter_door,p=bot.entity.position;
 const at=(x,y,z)=>bot.blockAt(new Vec3(x,y,z)),solid=(x,y,z)=>at(x,y,z)?.boundingBox==='block';
 let intact=true;
 for(let x=lo;x<=hi;x++)for(let z=zlo;z<=zhi;z++)if(!solid(x,184,z))intact=false;
 for(let y=181;y<=183;y++){
  for(let x=lo;x<=hi;x++)for(const z of [zlo,zhi])if(!solid(x,y,z))intact=false;
  for(let z=zlo;z<=zhi;z++)for(const x of [lo,hi])if(!(x===dx&&z===dz&&y<=182)&&!solid(x,y,z))intact=false;
 }
 const lower=at(dx,181,dz),upper=at(dx,182,dz);
 const validDoor=lower?.name==='oak_door'&&upper?.name==='oak_door';
 const closed=validDoor&&!lower.getProperties().open&&!upper.getProperties().open;
 const inside=p.x>lo+1.3&&p.x<hi-.3&&p.z>zlo+1.3&&p.z<zhi-.3&&Math.abs(p.y-181)<.15;
 const secure=inside&&intact&&closed;
 if(secure)runtime.shelterSince??=now;else runtime.shelterSince=null;
 const seconds=secure?Math.max(0,(now-runtime.shelterSince)/1000):0;
 const closeDoor=inside&&validDoor&&!closed&&p.x>dx+1.8;
 let door=null;
 if(validDoor&&((!inside&&closed)||closeDoor))for(const part of [lower,upper]){
  if(part.position.offset(.5,.5,.5).distanceTo(p)<3.2&&bot.canSeeBlock(part)){door=part;break;}
 }
 return {inside,secure,seconds,intact,closed,door,closeDoor};
}
async function interact(bot,task,sensed,permissions){
 if(!permissions.open_practice_doors||!sensed.door)return false;
 const block=sensed.door,[x,z]=task.shelter_door;
 if(block.name!=='oak_door'||block.position.x!==x||block.position.z!==z||![181,182].includes(block.position.y)||!bot.canSeeBlock(block))return false;
 await bot.activateBlock(block);await bot.look(bot.entity.yaw,0,true);return true;
}
module.exports={state,interact};

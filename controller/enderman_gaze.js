function protect(b,yaw,pitch){
 const eye=b.entity?.position?.offset(0,b.entity.eyeHeight||1.62,0);if(!eye)return pitch;
 for(const e of Object.values(b.entities||{})){
  if(e.name!=='enderman'||e.isValid===false||!e.position||e.position.distanceTo(eye)>48)continue;
  const keys=b.registry?.entitiesByName?.enderman?.metadataKeys||[];if(['creepy','stared_at'].some(k=>e.metadata?.[keys.indexOf(k)]===true||e.metadata?.[keys.indexOf(k)]===1))continue;
  const d=e.position.offset(0,2.55,0).minus(eye),length=d.norm();if(length<.1)continue;
  const dot=(-Math.sin(yaw)*Math.cos(pitch)*d.x+Math.sin(pitch)*d.y-Math.cos(yaw)*Math.cos(pitch)*d.z)/length;
  if(dot>.985){const hit=b.world?.raycast(eye,d.scaled(1/length),length);if(hit&&(!hit.intersect||eye.distanceTo(hit.intersect)<length-.3))continue;return -.55;}
 }
 return pitch;
}
function attach(b){if(typeof b.look!=='function'){b.once('spawn',()=>attach(b));return;}const look=b.look.bind(b);b.look=(yaw,pitch,...args)=>look(yaw,protect(b,yaw,pitch),...args);let at=0;const guard=()=>{if(!b.entity||Date.now()-at<150)return;at=Date.now();const pitch=protect(b,b.entity.yaw,b.entity.pitch);if(pitch!==b.entity.pitch)Promise.resolve(look(b.entity.yaw,pitch,true)).catch(()=>{});};b.on('physicsTick',guard);b.once('end',()=>b.removeListener('physicsTick',guard));}
module.exports={protect,attach};

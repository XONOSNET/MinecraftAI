const {Vec3}=require('vec3'),{standable,route}=require('./field_navigation'),space=require('./resource_space');
function retry(t,bot,q,bounds){
 const key=[q.x,q.y,q.z].join(','),attempts=t.buildAttempts??=new Map(),used=attempts.get(key)||new Set();
 const p=bot.entity.position;used.add(Math.floor(p.x)+','+Math.floor(p.z));attempts.set(key,used);
 if(used.size>=8)return false;
 const candidates=[];
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
  const x=t.plot.x+dx,z=t.plot.z+dz,goal=[x+.5,t.plot.y+.1,z+.5];
  if(used.has(x+','+z)||!standable(bot,x,t.plot.y,z)||!space.clearOfPlayers(bot,new Vec3(...goal)))continue;
  if(new Vec3(...goal).offset(0,1.62,0).distanceTo(new Vec3(q.x+.5,q.y+.5,q.z+.5))>4.2)continue;
  if(!require('./placement_reference').reference(bot,q,{standing:new Vec3(...goal)}))continue;
  if(route(bot,goal,12,512,true,{bounds,reversible:true}).reached)candidates.push(goal);
 }
 candidates.sort((a,b)=>new Vec3(...a).distanceTo(new Vec3(q.x,q.y,q.z))-new Vec3(...b).distanceTo(new Vec3(q.x,q.y,q.z)));
 if(!candidates.length)return false;t.buildApproach=candidates[0];return true;
}
module.exports={retry};

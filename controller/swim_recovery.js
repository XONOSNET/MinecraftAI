// Measure physical movement independently of route replans and remaining length.
const {Vec3}=require('vec3'),water=require('./water_navigation');
function bank(bot,{bounds,forbidden}){
 const p=bot.entity.position,base=p.floored(),choices=[];
 for(let dx=-16;dx<=16;dx++)for(let dz=-16;dz<=16;dz++){
  const d=Math.hypot(dx,dz);if(d<1||d>16)continue;
  for(const dy of [0,1,-1,2]){
   const q=[base.x+dx,Math.round(p.y)+dy,base.z+dz];
   if(bounds&&(q[0]+.5<=bounds[0]+1||q[0]+.5>=bounds[1]-2||q[2]+.5<=bounds[2]+1||q[2]+.5>=bounds[3]-2)||forbidden?.(q))continue;
   if(water.cell(bot,...q)?.wet===false)choices.push({goal:[q[0]+.5,q[1]+.1,q[2]+.5],distance:d+Math.abs(dy)});
  }
 }
 for(const c of choices.sort((a,b)=>a.distance-b.distance).slice(0,12)){
  const route=require('./field_navigation').travelRoute(bot,c.goal,24,4096,true,{bounds,forbidden,reversible:true});
  if(route.reached)return c.goal;
 }
 return null;
}
function update(n,bot,{now=Date.now(),bounds,forbidden}={}){
 const p=bot.entity.position,q=p.floored(),wet=!!bot.entity.isInWater||water.isWater(bot.blockAt(q))||water.isWater(bot.blockAt(q.offset(0,-1,0)));
 if(!wet&&bot.entity.onGround!==false||bot.entity.onGround===true&&water.cell(bot,q.x,Math.round(p.y),q.z)?.wet===false){n.swimRecovery=null;return null;}
 if(!wet&&!n.swimRecovery?.goal)return null;
 let s=n.swimRecovery;if(!s)s=n.swimRecovery={anchor:p.clone(),progressAt:now};
 const moving=bot.getControlState?.('forward')===true,elapsed=Math.max(0,now-(s.sampleAt??s.progressAt));
 s.attemptedMs??=0;
 if(moving&&(s.wasMoving??moving))s.attemptedMs+=elapsed;
 s.sampleAt=now;s.wasMoving=moving;
 if(Math.hypot(p.x-s.anchor.x,p.z-s.anchor.z)>=.5){s.anchor=p.clone();s.progressAt=now;s.attemptedMs=0;}
 // Vertical bobbing and changing route lengths never reset this clock.
 if(s.goal){
  if(now-s.progressAt>5000){s.goal=null;s.retryAt=now+500;}
  else return s;
 }
 // Alignment turns and brief decision gaps pause attempted travel; they must
 // not erase earlier failed swimming. A deliberate policy hold adds no time.
 if(!moving||s.attemptedMs<3000||now<(s.retryAt||0))return null;
 s.retryAt=now+5000;
 const goal=bank(bot,{bounds,forbidden});if(!goal)return null;
 s.goal=goal;s.progressAt=now;s.anchor=p.clone();return s;
}
module.exports={bank,update};

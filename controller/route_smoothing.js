// Shortcuts only across a verified, flat swept player footprint.
const {Vec3}=require('vec3');
const {standable}=require('./field_navigation');
const space=require('./resource_space');
const {forBot}=require('./behavior');
function flatCheck(bot,p,y,{bounds,forbidden,allowWater=false}={}){
 const blocks=new Map(),cells=new Map(),others=space.players(bot);
 const terrain={blockAt(q){const key=q.x+','+q.y+','+q.z;if(!blocks.has(key))blocks.set(key,bot.blockAt(q));return blocks.get(key);}};
 const safeCell=(x,z)=>{
  const key=x+','+z;if(cells.has(key))return cells.get(key);
  const safe=!(bounds&&(x+.5<=bounds[0]+1||x+.5>=bounds[1]-2||z+.5<=bounds[2]+1||z+.5>=bounds[3]-2))&&!forbidden?.([x,y,z])&&(allowWater?require('./water_navigation').cell(bot,x,y,z):standable(terrain,x,y,z))&&
   ![y,y+1].some(h=>terrain.blockAt(new Vec3(x,h,z))?.name.endsWith('_door'));
  cells.set(key,safe);return safe;
 };
 return q=>{
  if(!space.stepClear(p,{x:q[0],y,z:q[2]},others,forBot(bot).player_clearance))return false;
  const steps=Math.max(1,Math.ceil(Math.hypot(q[0]-p.x,q[2]-p.z)/.15));
  // Use the whole 0.6m body plus a small margin, not just a center ray.
  for(let i=0;i<=steps;i++){
   const x=p.x+(q[0]-p.x)*i/steps,z=p.z+(q[2]-p.z)*i/steps;
   for(let xx=Math.floor(x-.32);xx<=Math.floor(x+.32);xx++)for(let zz=Math.floor(z-.32);zz<=Math.floor(z+.32);zz++)if(!safeCell(xx,zz))return false;
  }
  return true;
 };
}
function clearFlatLeg(bot,p,q,options={}){
 return bot.entity.onGround===true&&Math.abs(q[1]-p.y)<.4&&Math.hypot(q[0]-p.x,q[2]-p.z)<=4&&flatCheck(bot,p,Math.round(q[1]),options)(q);
}
function smoothCue(bot,p,path,options={}){
 const {allowWater=false}=options,first=path[0];
 if(!first||first.gapFrom||first.centering&&!first.routeCenter||!allowWater&&bot.entity.onGround===false||Math.abs(first[1]-p.y)>(allowWater?1.4:.4))return first;
 const clear=flatCheck(bot,p,Math.round(first[1]),options);
 let cue=first,distance=0,previous=[p.x,p.y,p.z];
 for(let i=0;i<Math.min(path.length,12);i++){
  const q=path[i];distance+=Math.hypot(q[0]-previous[0],q[2]-previous[2]);previous=q;
  if(q.gapFrom||q.centering&&!q.routeCenter||Math.abs(q[1]-first[1])>.2||distance>6||Math.hypot(q[0]-p.x,q[2]-p.z)>(allowWater?2:4))break;
  if(clear(q))cue=q;
 }
 return cue;
}
module.exports={smoothCue,clearFlatLeg};

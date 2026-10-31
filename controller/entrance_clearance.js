// Preserve reversible navigation: clear foliage, never waive safe-return checks.
const {Vec3}=require('vec3'),access=require('./resource_access');
const {withinReach}=require('./resource_target'),{visibleBlock}=require('./target_scan');
function scan(t,b){
 const h=t.plot,pending=[];if(!h)return pending;
 for(let dx=-1;dx<=1;dx++)for(let dz=-6;dz<=-4;dz++){
  const x=h.x+dx,z=h.z+dz;let floor=null;
  for(let y=h.y;y>=h.y-3;y--){const block=b.blockAt(new Vec3(x,y,z));if(!block)break;if(block.boundingBox==='block'&&!block.name.endsWith('_leaves')&&!block.name.endsWith('_log')){floor=y;break;}}
  if(floor===null)continue;
  for(let y=floor+1;y<=Math.max(floor+3,h.y+1);y++){const block=b.blockAt(new Vec3(x,y,z));if(block?.name.endsWith('_leaves'))pending.push(block);}
 }
 return pending.sort((a,c)=>a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position));
}
function options(t,state){return {bounds:state.world.bounds,plots:(t.campPlots||[]).filter(h=>h&&(h.x!==t.plot.x||h.z!==t.plot.z))};}
async function tick(t,b,motor,goal,state,walk){
 const h=t.plot,p=b.entity.position;
 if(!h||Math.hypot(goal[0]-h.x-.5,goal[2]-h.z-.5)>7||Math.hypot(p.x-h.x-.5,p.z-h.z-.5)>10)return false;
 const safe=block=>block?.name.endsWith('_leaves')&&access.safeClear(b,block,options(t,state));
 const pending=scan(t,b).filter(safe);if(!pending.length)return false;
 const target=pending.find(block=>withinReach(b,block.position)&&visibleBlock(b,block));
 if(target){
  motor.pause();
  if(b.entity.onGround!==true||Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){t.message='Settling before clearing the entrance canopy';return true;}
  motor.lockLook(true);
  try{
   if(!await access.dig(b,target,{validate:safe}))return false;
   t.lastProgress=Date.now();t.entranceCleared=(t.entranceCleared||0)+1;t.navigator.lastPlan=-Infinity;t.path=[];
   t.message='Cleared '+target.name+' for safe steps through the home entrance';return true;
  }finally{motor.lockLook(false);}
 }
 // A blocked outside goal used to discard the reachable indoor route entirely.
 // First move to a safe work stance close enough to dig the actual overhang.
 const navigation=require('./world_navigation'),stance=navigation.insideHome(p,h)?[h.x+.5,h.y+.1,h.z-1.5]:navigation.homeApproach(h,b);
 if(p.distanceTo(new Vec3(...stance))<.5)return false;
 const route=require('./field_navigation').route(b,stance,16,1024,true,{bounds:state.world.bounds,reversible:true});
 if(!route.reached)return false;
 if(await walk(stance)===false)return false;
 t.message='Approaching foliage blocking the home entrance';return true;
}
module.exports={scan,tick};

// Prepare the whole house volume before walls can trap foliage or hide work faces.
const {Vec3}=require('vec3'),house=require('./house'),clearance=require('./construction_clearance');
const {standable,route}=require('./field_navigation'),space=require('./resource_space');
const {withinReach}=require('./resource_target'),{visibleBlock}=require('./target_scan');
function scan(t,b){
 const pending=[];let unloaded=false;
 for(let y=t.plot.y;y<=t.plot.y+house.config.wall_height+1;y++)for(let x=t.plot.x-3;x<=t.plot.x+3;x++)for(let z=t.plot.z-3;z<=t.plot.z+3;z++){
  const block=b.blockAt(new Vec3(x,y,z));if(!block){unloaded=true;continue;}
  if(clearance.natural(block.name))pending.push(block);
 }
 pending.sort((a,c)=>a.position.y-c.position.y||a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position));
 return {pending,unloaded};
}
function visible(b,block,standing=b.entity.position){
 if(!withinReach(b,block.position,standing))return false;
 const proxy=Object.create(b);proxy.entity={...b.entity,position:standing};
 return visibleBlock(proxy,block)||block.boundingBox==='empty'&&!clearance.firstObstruction(proxy,block.position);
}
function stances(t,b,targets,bounds){
 const candidates=[];
 for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
  const x=t.plot.x+dx,z=t.plot.z+dz,p=new Vec3(x+.5,t.plot.y+.1,z+.5);
  if(p.distanceTo(b.entity.position)<.7||!standable(b,x,t.plot.y,z)||!space.clearOfPlayers(b,p))continue;
  // Leave arrival tolerance in the reach test. Stop short safely, then dig.
  if(!targets.some(q=>q.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<3.7&&visible(b,q,p)))continue;
  candidates.push(p);
 }
 candidates.sort((a,c)=>a.distanceTo(b.entity.position)-c.distanceTo(b.entity.position));
 const reachable=[];
 for(const p of candidates){if(route(b,[p.x,p.y,p.z],16,1024,true,{bounds,reversible:true}).reached)reachable.push(p);if(reachable.length===4)break;}
 return reachable;
}
async function tick(t,b,motor,state,api,perception,tasks){
 const now=Date.now(),progress=t.plotClearing??={removed:0,deferred:new Map(),blockedAt:null};
 const {pending,unloaded}=scan(t,b);
 if(unloaded){motor.pause();t.message='Waiting for all house-plot blocks to load before clearing';return false;}
 if(!pending.length){motor.pause();t.message='House plot cleared; starting '+(t.afterPlotClear||'gathering');t.plotClearing=null;return true;}
 if(b.entity.onGround!==true){motor.pause();t.message='Settling on safe ground before clearing the house plot';return false;}
 if(Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.035){motor.pause();t.message='Stopping at the clearing stance before digging';return false;}
 const candidates=pending.filter(q=>now>(progress.deferred.get(q.position.toString())||0));
 const ready=candidates.find(q=>clearance.safe(t,b,q)&&b.canDigBlock(q)&&visible(b,q));
 if(ready){
  motor.pause();motor.lockLook(true);
  try{
   if(await clearance.clear(t,b,ready))progress.removed++;
   progress.blockedAt=null;
  }catch(error){if(error.code!=='BUILD_OBSTRUCTED')throw error;progress.deferred.set(ready.position.toString(),Date.now()+2500);}
  finally{motor.lockLook(false);}
  t.message=`Clearing house plot: ${progress.removed} removed, ${scan(t,b).pending.length} left`;return false;
 }
 const goals=stances(t,b,candidates.slice(0,16),state.world.bounds);
 for(const p of goals.slice(0,4)){
  const moved=await t.walk(b,motor,[p.x,p.y,p.z],state,api,perception,tasks);
  if(moved!==false){progress.blockedAt=null;t.message=`Clearing house plot: moving to an exposed work face, ${pending.length} blocks left`;return false;}
 }
 motor.pause();progress.blockedAt??=now;t.message=`Checking safe clearing angles: ${pending.length} house-plot obstructions left`;
 if(now-progress.blockedAt>30000)throw Error('No safe clearing stance for house-plot obstruction '+pending[0].name);
 return false;
}
module.exports={scan,visible,stances,tick};

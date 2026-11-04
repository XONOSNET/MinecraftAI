// A short physical escape step, not an unbounded tower or a path shortcut.
const {Vec3}=require('vec3'),nav=require('./field_navigation'),access=require('./resource_access');
const terrain=require('./home_terrain'),space=require('./resource_space');
const empty=b=>!!b&&['air','cave_air','void_air'].includes(b.name);
function permitted(t,p,bounds,walking=false){
 if(bounds&&(p.x<=bounds[0]+1||p.x>=bounds[1]-2||p.z<=bounds[2]+1||p.z>=bounds[3]-2))return false;
 return ![...(t.campPlots||[]),t.plot].filter(Boolean).some(h=>Math.abs(p.x-h.x)<=4&&Math.abs(p.z-h.z)<=4&&!(h.x===t.plot?.x&&h.z===t.plot?.z&&(walking||p.y<h.y&&Math.abs(p.x-h.x)<=3&&Math.abs(p.z-h.z)<=3)));
}
function clear(b,p){
 return [[0,0,0],[0,1,0],[0,2,0],[0,3,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].every(d=>{const v=b.blockAt(p.offset(...d));return v&&!['water','lava','fire','soul_fire','sand','red_sand','gravel','magma_block'].includes(v.name)&&!v.getProperties?.().waterlogged&&(d[0]||d[2]||empty(v));});
}
function plan(t,b,goal,state){
 const p=b.entity.position,feet=p.floored(),bounds=state.world.bounds;
 if(!b.entity.onGround||b.entity.isInWater||b.isSleeping||t.resourceAccess?.column?.length||!permitted(t,feet,bounds)||!terrain.solid(b.blockAt(feet.offset(0,-1,0)))||!clear(b,feet)||!space.clearOfPlayers(b,p,2))return null;
 // A simple step or walking exit wins even when the distant goal is blocked.
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1]){
  const q=feet.offset(dx,dy,dz);if(permitted(t,q,bounds,true)&&nav.standable(b,q.x,q.y,q.z)&&nav.route(b,[q.x+.5,q.y+.1,q.z+.5],6,256,true,{bounds,reversible:true}).reached)return null;
 }
 const item=b.inventory.items().filter(i=>access.material(i.name)&&i.count>0).sort((a,c)=>Number(a.name.endsWith('_planks'))-Number(c.name.endsWith('_planks')))[0];if(!item)return null;
 const old=t.escapeColumn,used=old&&old.x===feet.x&&old.z===feet.z&&feet.y>=old.baseY&&feet.y<=old.baseY+3?feet.y-old.baseY:0;
 const forbidden=q=>!permitted(t,new Vec3(...q),bounds,true);
 for(let rise=1;rise<=Math.min(3-used,item.count);rise++){
  if(!permitted(t,feet.offset(0,rise-1,0),bounds)||![0,1,2].every(y=>empty(b.blockAt(feet.offset(0,rise+y,0)))))break;
  const elevated=feet.offset(.5,rise,.5),proxy=Object.create(b);proxy.entity={...b.entity,position:elevated,onGround:true};
  proxy.blockAt=q=>{const v=q.floored();return v.x===feet.x&&v.z===feet.z&&v.y>=feet.y&&v.y<feet.y+rise?{name:item.name,position:v,boundingBox:'block',getProperties:()=>({})}:b.blockAt(q);};
  const candidates=[];
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(const step of [0,1]){
   if(!dx&&!dz)continue;const q=[feet.x+dx+.5,feet.y+rise+step+.1,feet.z+dz+.5];
   if(!forbidden([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])])&&nav.standable(b,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2]))&&space.clearOfPlayers(b,new Vec3(...q),2))candidates.push(q);
  }
  candidates.sort((a,c)=>new Vec3(...a).distanceTo(new Vec3(...goal))-new Vec3(...c).distanceTo(new Vec3(...goal)));
  for(const landing of candidates.slice(0,12)){
   if(nav.route(b,landing,12,512,true,{bounds,reversible:true,forbidden}).reached)continue;
   if(nav.route(proxy,landing,12,512,true,{bounds,reversible:true,forbidden}).reached)return {feet,item,rise,landing,baseY:old&&used?old.baseY:feet.y};
  }
 }
 return null;
}
async function attempt(t,b,motor,goal,state){
 if(Date.now()<(t.escapeColumn?.retryAt||0))return false;
 const next=plan(t,b,goal,state);if(!next)return false;
 const {feet,item}=next;
 if(!await access.stabilize(b,motor,feet))return true;
 if(!plan(t,b,goal,state))return false;
 motor.pause();motor.lockLook(true);const lease={until:Date.now()+10000,cancelled:false};b.labResourceAccess=lease;
 try{
  const placed=await access.jumpPlace(b,feet,item);
  t.escapeColumn={x:feet.x,z:feet.z,baseY:next.baseY,retryAt:Date.now()+3000};
  if(placed){t.lastProgress=Date.now();t.navigator.lastPlan=-Infinity;t.navigator.path=[];t.path=[];t.navigator.progressAt=Date.now();t.message='Jump-placed a carried block to escape the low ground; checking the route again';}
  return true;
 }finally{if(b.labResourceAccess===lease)delete b.labResourceAccess;b.clearControlStates();motor.lockLook(false);}
}
module.exports={plan,attempt,permitted};

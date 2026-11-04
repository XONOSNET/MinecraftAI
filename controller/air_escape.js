// Emergency transit while submerged: find breathable space before normal work.
const {Vec3}=require('vec3'),water=require('./water_navigation'),space=require('./resource_space');
const BAD=new Set(['lava','bubble_column','magma_block','fire','soul_fire','campfire','soul_campfire','cactus']);
const open=v=>!!v&&v.boundingBox==='empty'&&!BAD.has(v.name)&&!v.getProperties?.().waterlogged;
function cell(b,q){
 const feet=b.blockAt(q),head=b.blockAt(q.offset(0,1,0));
 if(!open(feet)||!open(head))return null;
 for(const p of [q,q.offset(0,1,0),q.offset(0,-1,0),q.offset(1,0,0),q.offset(-1,0,0),q.offset(0,0,1),q.offset(0,0,-1)]){
  const v=b.blockAt(p);if(!v||BAD.has(v.name)||water.isWater(v)&&Number(v.getProperties?.().level||0)!==0)return null;
 }
 const wet=water.isWater(feet)||water.isWater(head);
 if(!wet&&b.blockAt(q.offset(0,-1,0))?.boundingBox!=='block')return null;
 return {breathable:!water.isWater(head),wet};
}
function plan(b,{bounds,plots=[]}={}){
 const start=b.entity.position.floored(),queue=[{q:start,path:[]}],seen=new Set([start.toString()]),cache=new Map(),limit=Math.min(12,Math.max(4,Math.floor((b.labOxygen??20)*.8)));
 const checked=q=>{const k=q.toString();if(!cache.has(k))cache.set(k,cell(b,q));return cache.get(k);};
 for(let i=0;i<queue.length&&i<512;i++){
  const {q,path}=queue[i];if(path.length&&checked(q)?.breathable)return path;
  if(path.length>=limit)continue;
  for(const [dx,dy,dz] of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
   const next=q.offset(dx,dy,dz),key=next.toString();if(seen.has(key))continue;seen.add(key);
   if(bounds&&(next.x<=bounds[0]+1||next.x>=bounds[1]-2||next.z<=bounds[2]+1||next.z>=bounds[3]-2)||plots.some(h=>Math.abs(next.x-h.x)<=3&&Math.abs(next.z-h.z)<=3&&next.y>=h.y-1&&next.y<=h.y+4)||!checked(next)||!space.clearOfPlayers(b,next.offset(.5,0,.5),1))continue;
   queue.push({q:next,path:[...path,next.offset(.5,.1,.5).toArray()]});
  }
 }return null;
}
function drive(b,goal,permissions){
 const p=b.entity.position,q=new Vec3(Math.floor(goal[0]),Math.floor(goal[1]),Math.floor(goal[2])),d=Math.hypot(goal[0]-p.x,goal[2]-p.z);
 let safe=!!cell(b,q)&&d<=1.8&&space.clearOfPlayers(b,new Vec3(...goal),1);
 for(let i=1;i<=6&&safe;i++){
  const x=p.x+(goal[0]-p.x)*i/6,z=p.z+(goal[2]-p.z)*i/6;
  for(const dx of [-.29,.29])for(const dz of [-.29,.29])if(!cell(b,new Vec3(Math.floor(x+dx),Math.floor(p.y),Math.floor(z+dz))))safe=false;
 }
 const desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
 for(const k of ['back','left','right','sneak','sprint'])b.setControlState(k,false);
 b.setControlState('forward',!!permissions.move&&safe&&d>.12&&Math.abs(angle)<.4);b.setControlState('jump',!!permissions.jump&&!!b.entity.isInWater);
 if(permissions.turn&&d>.1)Promise.resolve(b.look(b.entity.yaw+Math.max(-.18,Math.min(.18,angle)),0,true)).catch(()=>{});
 return safe;
}
function tick(t,b,motor,state){
 const p=b.entity.position,eye=b.blockAt?.(p.offset(0,b.entity.eyeHeight||1.62,0).floored());
 if(!water.isWater(eye)){t.airEscape=null;return false;}
 const now=Date.now();let s=t.airEscape;
 if(s?.anchor&&p.distanceTo(s.anchor)>.4){s.anchor=p.clone();s.progressAt=now;}
 if(!s||!s.path?.length&&now-s.at>500||now-(s.progressAt||s.at)>2500||s.path?.some(q=>!cell(b,new Vec3(Math.floor(q[0]),Math.floor(q[1]),Math.floor(q[2]))))){s=t.airEscape={at:now,progressAt:now,anchor:p.clone(),path:plan(b,{bounds:state.world.bounds,plots:(t.campPlots||[]).filter(h=>h.x!==t.plot?.x||h.z!==t.plot?.z)})};}
 while(s.path?.length&&Math.hypot(s.path[0][0]-p.x,s.path[0][2]-p.z)<.4&&Math.abs(s.path[0][1]-p.y)<.4)s.path.shift();
 if(s.path?.length)motor.command(0,{kind:'expedition',air_escape:true,waypoints:[s.path[0]]},{},0);
 else motor.command(4,{kind:'expedition',water_route:true,waypoints:[[p.x,p.y,p.z]]},{},0);
 t.navigationActive=true;t.message=s.path?.length?'Emergency air escape: swimming to a checked breathable opening':'Emergency air escape: rising while checking for a loaded breathable opening';
 t.lastNavigation={phase:t.phase,position:p.toArray(),velocity:b.entity.velocity?.toArray?.(),in_water:true,oxygen:b.labOxygen,water_recovery:'Submerged air escape',target:s.path?.at(-1)||null,sampled_at:now};return true;
}
module.exports={cell,plan,drive,tick};

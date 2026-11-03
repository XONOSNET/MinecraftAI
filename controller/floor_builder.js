// Floor work uses checked footing and bounded alternate stances after a real rejection.
const {Vec3}=require('vec3'),house=require('./house'),{standable,route,travelRoute}=require('./field_navigation'),space=require('./resource_space');
const key=q=>[q.x,q.y,q.z].join(','),same=(a,b)=>a.x===b.x&&a.z===b.z;
const finished=(b,q)=>b.blockAt(new Vec3(q.x,q.y,q.z))?.name.endsWith('_planks');
const beside=(p,q)=>!(Math.abs(p.x-q.x-.5)<.85&&Math.abs(p.z-q.z-.5)<.85);
const FOUNDATION=new Set(['grass_block','dirt','stone','coarse_dirt','rooted_dirt','podzol','mycelium','moss_block','granite','diorite','andesite','sand','red_sand','gravel']);
function safeFoundation(b,block){
 if(!block||!FOUNDATION.has(block.name))return false;
 const q=block.position,below=b.blockAt(q.offset(0,-1,0)),above=b.blockAt(q.offset(0,1,0));
 // Replace only an exposed top layer over intact dry support. Sand beside
 // the tile is safe; digging underneath a falling column or into water is not.
 if(below?.boundingBox!=='block'||['magma_block','campfire','soul_campfire'].includes(below.name)||above?.boundingBox!=='empty')return false;
 return [[0,-1,0],[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].every(([x,y,z])=>{const v=b.blockAt(q.offset(x,y,z));return v&&!['water','lava','fire','soul_fire'].includes(v.name);});
}
function returnGoal(t,b,state){
 const nav=require('./world_navigation'),h=t.plot,front=nav.homeApproach(h,b),occupied=[Math.floor(b.entity.position.x),Math.round(b.entity.position.y),Math.floor(b.entity.position.z)];
 // An unfinished house has no mandatory doorway. A blocked front marker must
 // not invalidate reachable, intact ground inside its own cleared plot.
 if(!b.blockAt(new Vec3(Math.floor(front[0]),Math.round(front[1]),Math.floor(front[2]))))return front;
 const corners=[[-2,-2],[2,-2],[-2,2],[2,2],[0,0]].map(([x,z])=>[h.x+x+.5,h.y+.1,h.z+z+.5]);
 corners.sort((a,c)=>new Vec3(...a).distanceTo(b.entity.position)-new Vec3(...c).distanceTo(b.entity.position));
 const forbidden=q=>(t.campPlots||[]).some(p=>(p.x!==h.x||p.z!==h.z)&&!nav.privatePlotCell(occupied,p)&&nav.privatePlotCell(q,p));
 return [front,...corners].find(g=>{
  const cell=[Math.floor(g[0]),Math.round(g[1]),Math.floor(g[2])];
  if(!(standable(b,...cell)||require('./water_navigation').cell(b,...cell)?.wet===false)||!space.clearOfPlayers(b,new Vec3(...g)))return false;
  const radius=Math.min(192,Math.max(48,Math.ceil(new Vec3(...g).distanceTo(b.entity.position))+16)),options={bounds:state.world.bounds,reversible:true,forbidden};
  const planned=travelRoute(b,g,radius,8192,true,options);
  // One bounded expansion handles a long detour after night-time displacement.
  // Never turn an incomplete path into permission to clear or dig the plot.
  return planned.reached||travelRoute(b,g,Math.min(192,Math.max(96,radius*2)),16384,true,options).reached;
 })||null;
}
function stances(t,b,q,tiles,state,used=new Set()){
 const p=b.entity.position;
 // Navigation can arrive 0.4m short of a cell center. A neighboring one-cell
 // stance can therefore leave the body over the tile it must dig, forever
 // selecting the same already-arrived goal. Leave room for that tolerance.
 return tiles.filter(v=>Math.max(Math.abs(v.x-q.x),Math.abs(v.z-q.z))>=2&&!used.has(key(v))&&standable(b,v.x,t.plot.y,v.z))
  .map(v=>({tile:v,goal:[v.x+.5,t.plot.y+.1,v.z+.5]}))
  .filter(v=>new Vec3(...v.goal).offset(0,1.62,0).distanceTo(new Vec3(q.x+.5,q.y,q.z+.5))<4&&space.clearOfPlayers(b,new Vec3(...v.goal)))
  .filter(v=>!state.world?.bounds||route(b,v.goal,12,512,true,{bounds:state.world.bounds,reversible:true}).reached)
  .sort((a,c)=>Math.hypot(a.tile.x-q.x,a.tile.z-q.z)-Math.hypot(c.tile.x-q.x,c.tile.z-q.z)||new Vec3(...a.goal).distanceTo(p)-new Vec3(...c.goal).distanceTo(p));
}
async function tick(t,b,motor,state,api,scan,tasks){
 const p=b.entity.position;
 // Floor stances are local work positions, not long-distance return routes.
 // Prefer the exterior, then a checked intact plot stance; skip any dug holes.
 if(Math.hypot(p.x-t.plot.x-.5,p.z-t.plot.z-.5)>6||Math.abs(p.y-t.plot.y)>1.25){
  if(b.entity.onGround===false&&!b.entity.isInWater){motor.pause();t.message='Waiting to land before checking the return route to the house floor';return;}
  const goal=t.floorReturnGoal||returnGoal(t,b,state);
  if(!goal)throw Error('No safe return route to the unfinished house floor');
  t.floorReturnGoal=goal;
  const moved=await t.walk(b,motor,goal,state,api,scan,tasks);
  if(moved===false){t.floorReturnGoal=null;throw Error('No safe return route to the unfinished house floor');}
  t.message='Returning to the house before laying the floor';return;
 }
 t.floorReturnGoal=null;
 const all=house.blueprint(t.plot),tiles=all.filter(q=>q.floor),remaining=tiles.filter(q=>!finished(b,q));
 t.built=house.total-all.filter(q=>q.table?b.blockAt(new Vec3(q.x,q.y,q.z))?.name!=='crafting_table':!finished(b,q)).length;
 if(!remaining.length){motor.pause();t.floorRecovery=null;t.phase='table';return;}
 let recovery=t.floorRecovery;
 if(recovery&&!remaining.some(q=>key(q)===key(recovery.target))){t.floorRecovery=null;recovery=null;}
 if(recovery?.goal){
  const arrived=await t.walk(b,motor,recovery.goal,state,api,scan,tasks);
  if(arrived===false)throw Error('No safe route to retry the unfinished floor block');
  if(arrived!==true){t.message='Moving beside the refused floor block';return;}
  recovery.goal=null;
 }
 motor.pause();
 if(b.entity.onGround===false||Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){t.message='Settling on safe footing before floor work';return;}
 // Prefer nearby holes; the supporting face lies below the replacement block.
 // Use its depth for reach, rather than accepting a target center at max reach.
 const candidates=remaining.filter(q=>beside(p,q)&&new Vec3(q.x+.5,q.y,q.z+.5).distanceTo(p.offset(0,1.62,0))<4);
 let q=recovery?candidates.find(q=>key(q)===key(recovery.target)):candidates.sort((a,c)=>Number(b.blockAt(new Vec3(c.x,c.y,c.z))?.name==='air')-Number(b.blockAt(new Vec3(a.x,a.y,a.z))?.name==='air')||new Vec3(a.x,a.y,a.z).distanceTo(p)-new Vec3(c.x,c.y,c.z).distanceTo(p))[0];
 if(!q){
  const target=recovery?.target||remaining[0],next=stances(t,b,target,tiles,state,recovery?.used)[0];
  if(!next)throw Error('No safe stance beside the unfinished floor');
  if(recovery)recovery.goal=next.goal;
  await t.walk(b,motor,next.goal,state,api,scan,tasks);t.message='Taking a closer stance beside the unfinished floor';return;
 }
 if(space.players(b).some(v=>Math.abs(v.y-(q.y+1))<2&&Math.abs(v.x-q.x-.5)<.85&&Math.abs(v.z-q.z-.5)<.85)){t.message='Waiting for another player to clear the floor tile';return;}
 const block=b.blockAt(new Vec3(q.x,q.y,q.z));
 if(block?.boundingBox!=='empty'){
  if(!safeFoundation(b,block))throw Error('Floor foundation is obstructed or unsafe: '+(block?.name||'unloaded')+' at '+[q.x,q.y,q.z].join(','));
  await b.dig(block);
 }
 // Digging can take time; recheck the body before sending a placement packet.
 if(!beside(b.entity.position,q)||b.entity.onGround===false){t.message='Rechecking footing after digging the floor tile';return;}
 try{await t.place(b,q,null);}
 catch(error){
  if(error.code!=='BUILD_OBSTRUCTED'&&!String(error.message).includes('Server refused'))throw error;
  recovery=t.floorRecovery??={target:q,used:new Set(),refusals:0};recovery.refusals++;
  const current=tiles.find(v=>v.x===Math.floor(p.x)&&v.z===Math.floor(p.z));if(current)recovery.used.add(key(current));
  if(recovery.refusals>=3)throw Error('Floor placement refused after three checked stances: '+error.message);
  const next=stances(t,b,q,tiles,state,recovery.used)[0];if(!next)throw error;
  recovery.goal=next.goal;t.message='Floor placement refused; trying a different safe stance';return;
 }
 t.floorRecovery=null;t.lastProgress=Date.now();t.message=`Laying wooden floor ${tiles.length-remaining.length+1} / ${tiles.length}`;
}
module.exports={tick,stances,returnGoal,safeFoundation};

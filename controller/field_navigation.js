// Conservative local route planning over loaded, sensed blocks. No world edits.
const {Vec3}=require('vec3');
const space=require('./resource_space');
const water=require('./water_navigation');
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const HEIGHTS=[0,1,-1];
const BAD=new Set(['water','seagrass','tall_seagrass','kelp','kelp_plant','lava','fire','soul_fire','magma_block','campfire','soul_campfire','sweet_berry_bush','powder_snow','cactus','cobweb','oak_leaves']);
function safe(block){return !!block&&!BAD.has(block.name)&&!block.name.endsWith('_leaves');}
function passable(block){return safe(block)&&(block.boundingBox==='empty'||block.name.endsWith('_door')&&block.getProperties?.().open===true);}
function standable(bot,x,y,z){
 const at=h=>bot.blockAt(new Vec3(x,h,z));const floor=at(y-1),feet=at(y),head=at(y+1);
 const clear=safe(floor)&&floor.boundingBox==='block'&&(!floor.shapes||floor.shapes.some(s=>s[0]===0&&s[2]===0&&s[3]===1&&s[5]===1&&s[4]===1))&&passable(feet)&&passable(head);
 if(!clear)return false;
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++){
  const b=bot.blockAt(new Vec3(x+dx,y+dy,z+dz));if(!b||['water','lava','fire','magma_block','campfire'].includes(b.name))return false;
 }
 return true;
}
function route(bot,goal,radius=48,maxNodes=4096,avoidPlayers=false,options={}){
 const blocks=new Map(),stands=new Map();const terrain={blockAt(p){
  const key=p.x+','+p.y+','+p.z,cached=blocks.get(key);
  if(cached!==undefined)return cached;
  const block=bot.blockAt(p,false)??null;blocks.set(key,block);return block;
 }};
 const waterCells=new Map(),waterBot=Object.create(bot);waterBot.blockAt=terrain.blockAt;
 const transit=(x,y,z)=>{
  const key=x+','+y+','+z,cached=waterCells.get(key);
  if(cached!==undefined)return cached;
  const cell=water.cell(waterBot,x,y,z);waterCells.set(key,cell);return cell;
 };
 const stand=options.allowWater?(x,y,z)=>!!transit(x,y,z):(x,y,z)=>{
  const key=x+','+y+','+z,cached=stands.get(key);
  if(cached!==undefined)return cached;
  const clear=standable(terrain,x,y,z);stands.set(key,clear);return clear;
 };
 const others=avoidPlayers?space.players(bot):[];
 const p=bot.entity.position;let start=[Math.floor(p.x),Math.round(p.y),Math.floor(p.z)];const key=n=>n.join(',');let escape=null;
 // Surface buoyancy lifts the feet above the water cell before onGround can
 // become true. Plan from the checked surface below, rather than waiting for
 // a swimmer to land in mid-water. Never normalize dry airborne positions.
 if(options.allowWater&&!stand(...start)){
  for(const y of [Math.floor(p.y),Math.round(p.y)-1]){
   if(p.y-y>=0&&p.y-y<=1.4&&transit(start[0],y,start[2])?.wet){start=[start[0],y,start[2]];break;}
  }
 }
 if(!stand(...start)){
  if(bot.entity.onGround!==true)return {path:[],expanded:0,waiting_for_ground:true,message:'Waiting to settle on safe ground'};
  const occupied=bot.blockAt(new Vec3(...start));if(!occupied||BAD.has(occupied.name))return {path:[],expanded:0,message:'Hazard or unloaded ground under the bot; holding position'};
  // The body's trailing edge can still stand on the upper terrace after its
  // center crosses into the next stair cell. Continue the verified one-block
  // landing instead of sending it back toward the previous stair's center.
  const candidates=[];if(stand(start[0],start[1]-1,start[2]))candidates.push([start[0],start[1]-1,start[2]]);
  for(const [dx,dz] of DIRECTIONS)for(const dy of HEIGHTS){const n=[start[0]+dx,start[1]+dy,start[2]+dz];if(stand(...n))candidates.push(n);}
  candidates.sort((a,b)=>Math.hypot(a[0]+.5-p.x,a[2]+.5-p.z)-Math.hypot(b[0]+.5-p.x,b[2]+.5-p.z));
  if(!candidates.length)return {path:[],expanded:0,message:'Waiting for safe solid ground and loaded terrain'};
  start=candidates[0];escape=[start[0]+.5,start[1]+.1,start[2]+.5];
 }

 // Keep the uninterrupted water distance in search state for safety-aware retries.
 // The same cell reached from a nearby bank may permit a crossing that a
 // cheaper, already-tired approach cannot finish. Dry routes keep their keys.
 const boundedWater=options.allowWater&&options.boundedWater===true;
 if(boundedWater)start=[...start,0];
 const goalX=Math.floor(goal[0]),goalY=Math.round(goal[1]),goalZ=Math.floor(goal[2]);
 const atGoal=n=>n[0]===goalX&&n[2]===goalZ&&Math.abs(n[1]-goal[1])<.6;
 const distance=n=>{const horizontal=Math.abs(goalX-n[0])+Math.abs(goalZ-n[2]),height=Math.abs(goalY-n[1]);return Math.max(horizontal,height)+height*.4;};
 let best=start,bestDistance=distance(start),open=[{n:start,g:0,f:bestDistance}],visited=new Set(),costs=new Map([[key(start),0]]),parent=new Map(),jumps=new Map(),expanded=0;
 const waterLabels=new Map();
 const less=(a,b)=>a.f<b.f||a.f===b.f&&a.g>b.g;
 const push=v=>{open.push(v);let i=open.length-1;while(i){const parent=(i-1)>>1;if(!less(open[i],open[parent]))break;[open[i],open[parent]]=[open[parent],open[i]];i=parent;}};
 const pop=()=>{const first=open[0],last=open.pop();if(open.length){open[0]=last;let i=0;while(true){let child=i*2+1;if(child>=open.length)break;if(child+1<open.length&&less(open[child+1],open[child]))child++;if(!less(open[child],open[i]))break;[open[i],open[child]]=[open[child],open[i]];i=child;}}return first;};
 while(open.length&&expanded<maxNodes){
  const {n,g}=pop(),id=key(n);if(visited.has(id))continue;
  if(boundedWater&&(waterLabels.get(n.slice(0,3).join(','))||[]).some(v=>v.wet<=n[3]&&v.g<=g&&(v.wet<n[3]||v.g<g)))continue;
  visited.add(id);expanded++;
  const d=distance(n);if(d<bestDistance){best=n;bestDistance=d;}if(atGoal(n)){best=n;break;}
  for(const [dx,dz] of DIRECTIONS)for(const dy of HEIGHTS){
   const next=[n[0]+dx,n[1]+dy,n[2]+dz];
   if(options.bounds&&(next[0]+.5<=options.bounds[0]+1||next[0]+.5>=options.bounds[1]-2||next[2]+.5<=options.bounds[2]+1||next[2]+.5>=options.bounds[3]-2))continue;
   if(options.forbidden?.(next)||options.forbiddenEdge?.(n,next))continue;
   if(Math.abs(next[0]-start[0])>radius||Math.abs(next[2]-start[2])>radius)continue;
   const waterCell=options.allowWater?transit(...next):null;
   if(!(options.allowWater?waterCell:stand(...next)))continue;
   if(others.length&&!space.stepClear(key(n)===key(start)&&!escape?p:{x:n[0]+.5,y:n[1],z:n[2]+.5},{x:next[0]+.5,y:next[1],z:next[2]+.5},others,require('./behavior').forBot(bot).player_clearance))continue;
   // An ascending jump also needs clearance above the departure block.
   if(dy===1&&!(options.allowWater&&water.isWater(terrain.blockAt(new Vec3(n[0],n[1],n[2]))))){const over=terrain.blockAt(new Vec3(n[0],n[1]+2,n[2]));if(!safe(over)||over.boundingBox!=='empty')continue;}
   if(options.reversible&&dy===-1){const over=terrain.blockAt(new Vec3(next[0],next[1]+2,next[2]));if(!passable(over))continue;}
   if(boundedWater){next.push(waterCell.wet?n[3]+1:0);if(next[3]>24)continue;}
   const k=key(next),ng=g+(waterCell?.cost??1)+(dy!==0?.4:0);
   if(boundedWater){
    const cellKey=next.slice(0,3).join(','),labels=waterLabels.get(cellKey)||[];
    if(labels.some(v=>v.wet<=next[3]&&v.g<=ng))break;
    waterLabels.set(cellKey,[...labels.filter(v=>!(next[3]<=v.wet&&ng<=v.g)),{wet:next[3],g:ng}]);
   }
   if(ng<(costs.get(k)??Infinity)){costs.set(k,ng);parent.set(k,n);jumps.delete(k);push({n:next,g:ng,f:ng+distance(next)});}break;
  }
  if(options.allowGaps&&!options.allowWater)for(const [dx,dz] of DIRECTIONS){
   const next=[n[0]+dx*2,n[1],n[2]+dz*2];
   if(options.forbiddenEdge?.(n,next)||Math.abs(next[0]-start[0])>radius||Math.abs(next[2]-start[2])>radius||!require('./checked_jump').gap(bot,n,next,options))continue;
   const k=key(next),ng=g+2.8;if(ng<(costs.get(k)??Infinity)){costs.set(k,ng);parent.set(k,n);jumps.set(k,n);push({n:next,g:ng,f:ng+distance(next)});}
  }
 }
 const path=[];let n=best;while(key(n)!==key(start)){const q=[n[0]+.5,n[1]+.1,n[2]+.5];if(jumps.has(key(n)))q.gapFrom=jumps.get(key(n));path.push(q);n=parent.get(key(n));if(!n)break;}
 const reached=atGoal(best)&&stand(...best);
 path.reverse();if(reached&&Math.hypot(goal[0]-p.x,goal[2]-p.z)>.3)path.push([goal[0],best[1]+.1,goal[2]]);
 // The cell center is clear, but an off-center body can clip an adjacent table
 // or wall when it starts the next leg. Center before taking that corner.
 if(!escape&&path.length&&Math.hypot(start[0]+.5-p.x,start[2]+.5-p.z)>.2){
  const adjacentWall=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dz])=>{const b=terrain.blockAt(new Vec3(start[0]+dx,start[1],start[2]+dz));return b?.boundingBox==='block'&&!b.name.endsWith('_door');});
  const adjacentDrop=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dz])=>!stand(start[0]+dx,start[1],start[2]+dz));
  // A verified downhill body corridor needs no retreat to the old cell center.
  // Lateral travel beside an edge still centers, as do nearby solid walls.
  const next=path[0],descending=next[1]-p.y<-.6&&next[1]-p.y> -1.2;
  const heading=Math.atan2(-(next[0]-p.x),-(next[2]-p.z));
  const directDescent=descending&&require('./perception').proximity(bot,{recovery:false}).canStepDown(heading,Math.min(.75,Math.hypot(next[0]-p.x,next[2]-p.z)));
  const ascending=next[1]-p.y>.6&&next[1]-p.y<1.2;
  const aligned=Math.floor(next[0])!==start[0]?Math.abs(p.z-start[2]-.5)<.15:Math.abs(p.x-start[0]-.5)<.15;
  const directAscent=ascending&&aligned&&require('./checked_jump').step(bot,next);
  if(!options.allowWater&&((adjacentWall||adjacentDrop&&!directDescent)&&!directAscent)){const center=[start[0]+.5,start[1]+.1,start[2]+.5];
   if(!others.length||space.stepClear(p,{x:center[0],y:center[1],z:center[2]},others,require('./behavior').forBot(bot).player_clearance)){center.centering=true;center.routeCenter=true;path.unshift(center);}
  }
 }
 if(escape)path.unshift(escape);
 // Finish centering before taking a vertical step, and settle on its landing.
 for(let i=0;i<path.length;i++){
  const before=i?path[i-1][1]:p.y,next=path[i+1]?.[1]??path[i][1];
  if(Math.abs(path[i][1]-before)>.4||Math.abs(next-path[i][1])>.4)path[i].centering=true;
 }
 return {path,expanded,reached,budget_exhausted:expanded>=maxNodes,message:path.length?'Following a safe route through loaded terrain':'No safe route in loaded terrain; holding position'};
}
function travelRoute(bot,goal,radius=48,maxNodes=4096,avoidPlayers=false,options={}){
 const dry=route(bot,goal,radius,maxNodes,avoidPlayers,options);if(dry.reached)return dry;
 const wet=route(bot,goal,radius,maxNodes,avoidPlayers,{...options,allowWater:true});
 return wet.reached&&require('./water_navigation').validRoute(bot,wet.path,goal)?{...wet,water_route:true}:dry;
}
module.exports={standable,route,travelRoute};

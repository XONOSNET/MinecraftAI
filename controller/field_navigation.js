// Conservative local route planning over loaded, sensed blocks. No world edits.
const {Vec3}=require('vec3');
const space=require('./resource_space');
const BAD=new Set(['water','lava','fire','soul_fire','magma_block','campfire','soul_campfire','sweet_berry_bush','powder_snow','cactus','cobweb','oak_leaves']);
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
 const blocks=new Map(),stands=new Map();const terrain={blockAt(p){const key=p.x+','+p.y+','+p.z;if(!blocks.has(key))blocks.set(key,bot.blockAt(p));return blocks.get(key);}};
 const waterCells=new Map(),waterBot=Object.create(bot);waterBot.blockAt=terrain.blockAt;
 const transit=(x,y,z)=>{const key=x+','+y+','+z;if(!waterCells.has(key))waterCells.set(key,require('./water_navigation').cell(waterBot,x,y,z));return waterCells.get(key);};
 const stand=(x,y,z)=>{const key=x+','+y+','+z;if(!stands.has(key))stands.set(key,options.allowWater?!!transit(x,y,z):standable(terrain,x,y,z));return stands.get(key);};
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
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){const n=[start[0]+dx,start[1]+dy,start[2]+dz];if(stand(...n))candidates.push(n);}
  candidates.sort((a,b)=>Math.hypot(a[0]+.5-p.x,a[2]+.5-p.z)-Math.hypot(b[0]+.5-p.x,b[2]+.5-p.z));
  if(!candidates.length)return {path:[],expanded:0,message:'Waiting for safe solid ground and loaded terrain'};
  start=candidates[0];escape=[start[0]+.5,start[1]+.1,start[2]+.5];
 }

 const distance=n=>{const horizontal=Math.abs(Math.floor(goal[0])-n[0])+Math.abs(Math.floor(goal[2])-n[2]),height=Math.abs(Math.round(goal[1])-n[1]);return Math.max(horizontal,height)+height*.4;};
 let best=start,bestDistance=distance(start),open=[{n:start,g:0,f:bestDistance}],visited=new Set(),costs=new Map([[key(start),0]]),parent=new Map(),expanded=0;
 const less=(a,b)=>a.f<b.f||a.f===b.f&&a.g>b.g;
 const push=v=>{open.push(v);let i=open.length-1;while(i){const parent=(i-1)>>1;if(!less(open[i],open[parent]))break;[open[i],open[parent]]=[open[parent],open[i]];i=parent;}};
 const pop=()=>{const first=open[0],last=open.pop();if(open.length){open[0]=last;let i=0;while(true){let child=i*2+1;if(child>=open.length)break;if(child+1<open.length&&less(open[child+1],open[child]))child++;if(!less(open[child],open[i]))break;[open[i],open[child]]=[open[child],open[i]];i=child;}}return first;};
 while(open.length&&expanded<maxNodes){
  const {n,g}=pop(),id=key(n);if(visited.has(id))continue;visited.add(id);expanded++;
  const d=distance(n);if(d<bestDistance){best=n;bestDistance=d;}if(n[0]===Math.floor(goal[0])&&n[2]===Math.floor(goal[2])&&Math.abs(n[1]-goal[1])<.6){best=n;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){
   const next=[n[0]+dx,n[1]+dy,n[2]+dz];
   if(options.bounds&&(next[0]+.5<=options.bounds[0]+1||next[0]+.5>=options.bounds[1]-2||next[2]+.5<=options.bounds[2]+1||next[2]+.5>=options.bounds[3]-2))continue;
   if(options.forbidden?.(next))continue;
   if(Math.abs(next[0]-start[0])>radius||Math.abs(next[2]-start[2])>radius||!stand(...next))continue;
   if(others.length&&!space.stepClear(key(n)===key(start)&&!escape?p:{x:n[0]+.5,y:n[1],z:n[2]+.5},{x:next[0]+.5,y:next[1],z:next[2]+.5},others,require('./behavior').forBot(bot).player_clearance))continue;
   // An ascending jump also needs clearance above the departure block.
   if(dy===1&&!(options.allowWater&&bot.blockAt(new Vec3(...n))?.name==='water')){const over=terrain.blockAt(new Vec3(n[0],n[1]+2,n[2]));if(!safe(over)||over.boundingBox!=='empty')continue;}
   if(options.reversible&&dy===-1){const over=terrain.blockAt(new Vec3(next[0],next[1]+2,next[2]));if(!passable(over))continue;}
   const k=key(next),ng=g+(options.allowWater?transit(...next).cost:1)+(dy!==0?.4:0);
   if(ng<(costs.get(k)??Infinity)){costs.set(k,ng);parent.set(k,n);push({n:next,g:ng,f:ng+distance(next)});}break;
  }
 }
 const path=[];let n=best;while(key(n)!==key(start)){path.push([n[0]+.5,n[1]+.1,n[2]+.5]);n=parent.get(key(n));if(!n)break;}
 const reached=best[0]===Math.floor(goal[0])&&best[2]===Math.floor(goal[2])&&Math.abs(best[1]-goal[1])<.6&&stand(...best);
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
  if(!options.allowWater&&(adjacentWall||adjacentDrop&&!directDescent)){const center=[start[0]+.5,start[1]+.1,start[2]+.5];
   if(!others.length||space.stepClear(p,{x:center[0],y:center[1],z:center[2]},others,require('./behavior').forBot(bot).player_clearance)){center.centering=true;path.unshift(center);}
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

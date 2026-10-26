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
function route(bot,goal,radius=48,maxNodes=4096,avoidPlayers=false){
 const others=avoidPlayers?space.players(bot):[];
 const p=bot.entity.position;let start=[Math.floor(p.x),Math.round(p.y),Math.floor(p.z)];const key=n=>n.join(',');let escape=null;
 if(!standable(bot,...start)){
  if(bot.entity.onGround!==true)return {path:[],expanded:0,message:'Waiting to settle on safe ground'};
  const occupied=bot.blockAt(new Vec3(...start));if(!occupied||BAD.has(occupied.name))return {path:[],expanded:0,message:'Hazard or unloaded ground under the bot; holding position'};
  const candidates=[];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){const n=[start[0]+dx,start[1]+dy,start[2]+dz];if(standable(bot,...n))candidates.push(n);}
  candidates.sort((a,b)=>Math.hypot(a[0]+.5-p.x,a[2]+.5-p.z)-Math.hypot(b[0]+.5-p.x,b[2]+.5-p.z));
  if(!candidates.length)return {path:[],expanded:0,message:'Waiting for safe solid ground and loaded terrain'};
  start=candidates[0];escape=[start[0]+.5,start[1]+.1,start[2]+.5];
 }

 const distance=n=>Math.hypot(goal[0]-n[0]-.5,goal[2]-n[2]-.5);
 let best=start,bestDistance=distance(start),open=[{n:start,g:0,f:bestDistance}],visited=new Set(),costs=new Map([[key(start),0]]),parent=new Map(),expanded=0;
 while(open.length&&expanded<maxNodes){
  let i=0;for(let j=1;j<open.length;j++)if(open[j].f<open[i].f)i=j;
  const {n,g}=open.splice(i,1)[0],id=key(n);if(visited.has(id))continue;visited.add(id);expanded++;
  const d=distance(n);if(d<bestDistance){best=n;bestDistance=d;}if(n[0]===Math.floor(goal[0])&&n[2]===Math.floor(goal[2])&&Math.abs(n[1]-goal[1])<1.5){best=n;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){
   const next=[n[0]+dx,n[1]+dy,n[2]+dz];
   if(Math.abs(next[0]-start[0])>radius||Math.abs(next[2]-start[2])>radius||!standable(bot,...next))continue;
   if(others.length&&!space.stepClear({x:n[0]+.5,y:n[1],z:n[2]+.5},{x:next[0]+.5,y:next[1],z:next[2]+.5},others))continue;
   // An ascending jump also needs clearance above the departure block.
   if(dy===1){const over=bot.blockAt(new Vec3(n[0],n[1]+2,n[2]));if(!safe(over)||over.boundingBox!=='empty')continue;}
   const k=key(next),ng=g+1+(dy!==0?.4:0);
   if(ng<(costs.get(k)??Infinity)){costs.set(k,ng);parent.set(k,n);open.push({n:next,g:ng,f:ng+distance(next)});}break;
  }
 }
 const path=[];let n=best;while(key(n)!==key(start)){path.push([n[0]+.5,n[1]+.1,n[2]+.5]);n=parent.get(key(n));if(!n)break;}
 const reached=best[0]===Math.floor(goal[0])&&best[2]===Math.floor(goal[2])&&Math.abs(best[1]-goal[1])<1.5&&standable(bot,...best);
 path.reverse();if(reached&&Math.hypot(goal[0]-p.x,goal[2]-p.z)>.3)path.push([goal[0],best[1]+.1,goal[2]]);if(escape)path.unshift(escape);return {path,expanded,reached,message:path.length?'Following a safe route through loaded terrain':'No safe route in loaded terrain; holding position'};
}
module.exports={standable,route};

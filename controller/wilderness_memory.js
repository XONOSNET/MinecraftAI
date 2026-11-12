// Bounded per-bot landmarks and physically traversed roads. No unloaded-world oracle.
const {Vec3}=require('vec3'),{route,standable}=require('./field_navigation');
const key=p=>p.map(Math.floor).join(','),point=p=>[p.x,p.y,p.z];
class WildernessMemory{
 constructor(saved={}){
  this.resources=[];for(const r of (saved.resources||[]).slice(-96))this.remember(r.kind,r.position,r.approach);
  this.roads=new Map((saved.roads||[]).slice(0,512).map(p=>[key(p),p]));
  this.edges=new Map();for(const [a,b] of saved.edges||[])if(this.roads.has(a)&&this.roads.has(b)){this.link(a,b);this.link(b,a);}
  this.visited=new Set();this.rejected=new Map();this.replans=0;
  this.encounters=(saved.encounters||[]).slice(-32);
 }
 link(a,b){if(!this.edges.has(a))this.edges.set(a,new Set());this.edges.get(a).add(b);}
 remember(kind,p,approach=null){
  const v=Array.isArray(p)?[...p]:point(p),mobile=kind==='food'||kind==='wool';
  // Nearby sightings of moving animals are one search patch, not hundreds of
  // new landmarks. Each resource class owns a bounded share of memory, so
  // livestock movement cannot erase the home, trees or stone used for scouting.
  const old=this.resources.find(r=>r.kind===kind&&(mobile?Math.hypot(r.position[0]-v[0],r.position[2]-v[2])<6&&Math.abs(r.position[1]-v[1])<4:key(r.position)===key(v)));
  if(old){if(mobile)old.position=v;if(approach)old.approach=Array.isArray(approach)?[...approach]:point(approach);return;}
  this.resources.push({kind,position:v,...(approach?{approach:Array.isArray(approach)?[...approach]:point(approach)}:{})});
  const limit=({home:1,wood:24,stone:24,food:24,wool:16})[kind]||7;
  while(this.resources.filter(r=>r.kind===kind).length>limit)this.resources.splice(this.resources.findIndex(r=>r.kind===kind),1);
  while(this.resources.length>96){const at=this.resources.findIndex(r=>r.kind!=='home');this.resources.splice(at<0?0:at,1);}
 }
 observe(bot){
  if(!bot.entity.onGround)return;
  const p=point(bot.entity.position),id=key(p);if(!standable(bot,Math.floor(p[0]),Math.round(p[1]),Math.floor(p[2])))return;
  if(!this.roads.has(id)&&this.roads.size<512)this.roads.set(id,[Math.floor(p[0])+.5,Math.round(p[1])+.1,Math.floor(p[2])+.5]);
  if(this.last&&this.last!==id&&this.roads.has(id)&&this.roads.has(this.last)){
   const a=this.roads.get(this.last),b=this.roads.get(id);
   if(Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2])===1&&Math.abs(a[1]-b[1])<=1){this.link(this.last,id);this.link(id,this.last);}
  }this.last=id;
 }
 reject(p,now=Date.now()){this.rejected.set(key(p),now+30000);this.replans++;}
 available(p,now=Date.now()){return now>=(this.rejected.get(key(p))||0);}
 encounter(enemy,outcome,p){
  if(typeof enemy!=='string')return;
  this.encounters.push({enemy,outcome,position:Array.isArray(p)?[...p]:point(p)});
  if(this.encounters.length>32)this.encounters.shift();
 }
 // A blocked long search can reconnect to a route that this bot actually walked.
 detour(bot,goal,bounds){
  const valid=p=>standable(bot,Math.floor(p[0]),Math.round(p[1]),Math.floor(p[2]));
  const nodes=[...this.roads].filter(([,p])=>valid(p)),start=nodes.filter(([,p])=>bot.entity.position.distanceTo(new Vec3(...p))<5).sort((a,b)=>bot.entity.position.distanceTo(new Vec3(...a[1]))-bot.entity.position.distanceTo(new Vec3(...b[1]))),end=new Set(nodes.filter(([,p])=>new Vec3(...p).distanceTo(new Vec3(...goal))<5).map(([id])=>id));
  for(const [id,p] of start.slice(0,3)){
   const entry=route(bot,p,12,512,true,{bounds,reversible:true});if(!entry.reached)continue;
   const queue=[id],parent=new Map([[id,null]]);let found;
   for(let i=0;i<queue.length&&i<512;i++){const at=queue[i];if(end.has(at)){found=at;break;}for(const next of this.edges.get(at)||[])if(!parent.has(next)&&this.roads.has(next)&&valid(this.roads.get(next))){parent.set(next,at);queue.push(next);}}
   if(!found)continue;
   const last=this.roads.get(found),proxy=Object.create(bot);proxy.entity={...bot.entity,position:new Vec3(...last),onGround:true};
   const exit=route(proxy,goal,12,512,true,{bounds,reversible:true});if(!exit.reached)continue;
   const middle=[];for(let at=found;at!==null;at=parent.get(at))middle.push(this.roads.get(at));middle.reverse();
   // Validate every edge again; a new ceiling must not turn descent into a trap.
   const full=[...entry.path,...middle,...exit.path];let previous=point(bot.entity.position),safe=true;
   for(const q of full){if(Math.abs(q[1]-previous[1])>1.01||q[1]>previous[1]+.5&&bot.blockAt(new Vec3(Math.floor(previous[0]),Math.round(previous[1])+2,Math.floor(previous[2])))?.boundingBox!=='empty'){safe=false;break;}previous=q;}
   if(safe)return full;
  }return null;
 }
 snapshot(){return {resources:this.resources,roads:[...this.roads.values()],edges:[...this.edges].flatMap(([a,bs])=>[...bs].filter(b=>a<b).map(b=>[a,b])).slice(0,1024),encounters:this.encounters};}
}
module.exports={WildernessMemory,key};

// Per-bot home and route state. Geometry guides both controllers; policy still acts.
const {Vec3}=require('vec3');
const {route,standable}=require('./field_navigation');
const {forBot}=require('./behavior');
const {doorwayDescriptor}=require('./doorway');
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[2])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(p.x-a[0]-dx*t,p.z-a[2]-dz*t);
}
function corridorDistance(p,points){let best=Infinity;for(let i=1;i<points.length;i++)best=Math.min(best,segmentDistance(p,points[i-1],points[i]));return best;}
function homeApproach(plot){return plot?[plot.x+.5,plot.y+.1,plot.z-4.5]:null;}
function insideHome(p,plot){return !!plot&&Math.abs(p.x-plot.x-.5)<2.5&&Math.abs(p.z-plot.z-.5)<2.5&&Math.abs(p.y-plot.y)<.6;}
function crossingHome(bot,goal,plot){return insideHome(bot.entity.position,plot)!==insideHome(new Vec3(...goal),plot);}
function routeDoorway(bot,plot,path,goal){
 if(!plot)return null;
 const index=path.findIndex(q=>Math.floor(q[0])===plot.x&&Math.floor(q[2])===plot.z-3);
 if(index<0)return null;
 // Use the actual crossing direction; the ultimate destination may be behind
 // the house, on the same side of the door plane as the starting room.
 return doorwayDescriptor(bot,bot.blockAt(new Vec3(plot.x,plot.y,plot.z-3)),path[index+1]||goal);
}
function approachGoal(bot,goal,plot){
 if(!plot||!crossingHome(bot,goal,plot))return goal;
 const inside=insideHome(bot.entity.position,plot);
 const door=bot.blockAt(new Vec3(plot.x,plot.y,plot.z-3));
 return door?.name.endsWith('_door')&&!door.getProperties().open?(inside?[plot.x+.5,plot.y+.1,plot.z-1.5]:homeApproach(plot)):goal;
}
class WorldNavigation{
 constructor(){this.path=[];this.destination=null;this.lastPlan=-Infinity;this.anchor=null;this.best=Infinity;this.progressAt=0;this.status={};}
 plan(bot,goal,{plot=null,bounds,now=Date.now()}={}){
  const p=bot.entity.position,target=approachGoal(bot,goal,plot),key=target.join(','),home=homeApproach(plot);
  if(key!==this.destination){this.destination=key;this.path=[];this.best=Infinity;this.progressAt=now;this.lastPlan=-Infinity;this.blocked=false;}
  while(this.path.length&&Math.hypot(this.path[0][0]-p.x,this.path[0][2]-p.z)<.4&&Math.abs(this.path[0][1]-p.y)<.4)this.anchor=this.path.shift();
  const corridor=[this.anchor||[p.x,p.y,p.z],...this.path.slice(0,3)];
  const offRoute=this.path.length&&corridorDistance(p,corridor)>.85;
  const invalid=this.path.slice(0,3).some(q=>!standable(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])));
  const due=now-this.lastPlan>=forBot(bot).route_replan_ms;
  if(this.lastPlan===-Infinity||due||offRoute||invalid){
   const radius=Math.min(96,Math.max(48,Math.ceil(Math.hypot(target[0]-p.x,target[2]-p.z))+16));
   const planned=route(bot,target,radius,8192,true,{bounds,reversible:true});this.lastPlan=now;this.anchor=[p.x,p.y,p.z];
   this.path=planned.reached?planned.path:[];this.blocked=!planned.reached;
   this.reason=planned.budget_exhausted?'Return-route search reached its limit; checking again':'No complete safe route in loaded terrain; checking for another way';
   this.expanded=planned.expanded;this.replanned=true;
  }else this.replanned=false;
  let remaining=0,from=[p.x,p.y,p.z];for(const point of this.path){remaining+=Math.hypot(point[0]-from[0],point[2]-from[2])+Math.abs(point[1]-from[1])*.4;from=point;}
  const arrived=!this.blocked&&!this.path.length&&Math.hypot(target[0]-p.x,target[2]-p.z)<.4&&Math.abs(target[1]-p.y)<.4;
  if(!this.blocked&&(remaining<this.best-.75||arrived)){this.best=remaining;this.progressAt=now;}
  const idle=Math.max(0,(now-this.progressAt)/1000),timeout=forBot(bot).stationary_timeout_seconds;
  this.status={home,target:[...target],state:this.blocked?'blocked':arrived?'arrived':'following',height_delta:Math.round(((home||target)[1]-p.y)*10)/10,
   route_complete:!this.blocked,remaining_blocks:Math.round(remaining*10)/10,waypoints:this.path.length,no_progress_seconds:Math.floor(idle),reset_seconds:Math.max(0,Math.ceil(timeout-idle)),expanded:this.expanded||0};
  if(idle>=timeout)throw Error('No route progress for '+timeout+' seconds; ended this attempt instead of circling.');
  return {path:this.path,cue:this.path[0]||target,corridor:[this.anchor||[p.x,p.y,p.z],...this.path.slice(0,3)],blocked:this.blocked,arrived,message:this.reason};
 }
}
module.exports={WorldNavigation,homeApproach,approachGoal,corridorDistance,insideHome,crossingHome,routeDoorway};

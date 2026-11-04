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
function travelCue(p,path){
 const first=path[0];if(!first||Math.abs(first[1]-p.y)>.4)return first;
 let cue=first;
 for(let i=1;i<path.length;i++){
  const q=path[i],dx=q[0]-p.x,dz=q[2]-p.z,d=Math.hypot(dx,dz);
  if(d>4||Math.abs(q[1]-first[1])>.2)break;
  const ax=cue[0]-p.x,az=cue[2]-p.z,a=Math.hypot(ax,az);
  // Preserve corners and sideways centering. Only join collinear, checked cells.
  if(a>.05&&(ax*dx+az*dz)/(a*d)<.999)break;
  cue=q;
 }
 return cue;
}
function homeApproach(plot,bot=null){
 if(!plot)return null;
 const x=plot.x,z=plot.z-5;
 if(bot){
  // The preferred marker is not guaranteed dry or supported on natural terrain.
  // Pick a nearby exterior landing instead of routing forever to an invalid cell.
  for(const [dx,dz] of [[0,0],[0,1],[-1,0],[1,0],[-1,1],[1,1],[0,-1],[-2,0],[2,0]])
   for(const y of [plot.y,plot.y-1,plot.y+1])if(standable(bot,x+dx,y,z+dz))return [x+dx+.5,y+.1,z+dz+.5];
 }
 if(bot)for(const [dx,dz] of [[0,0],[0,1],[-1,0],[1,0],[-1,1],[1,1],[0,-1],[-2,0],[2,0]])
  for(const y of [plot.y,plot.y-1,plot.y+1])if(require('./water_navigation').cell(bot,x+dx,y,z+dz)?.wet===false)return [x+dx+.5,y+.1,z+dz+.5];
 return [x+.5,plot.y+.1,z+.5];
}
function samePlot(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z;}
function privatePlotCell(q,h){return q[0]>=h.x-3&&q[0]<=h.x+3&&q[2]>=h.z-3&&q[2]<=h.z+3&&q[1]>=h.y-1&&q[1]<=h.y+4;}
function insideHome(p,plot){return !!plot&&Math.abs(p.x-plot.x-.5)<2.5&&Math.abs(p.z-plot.z-.5)<2.5&&Math.abs(p.y-plot.y)<.6;}
function crossingHome(bot,goal,plot){return insideHome(bot.entity.position,plot)!==insideHome(new Vec3(...goal),plot);}
function routeDoorway(bot,plot,path,goal){
 if(!plot)return null;
 const index=path.findIndex(q=>Math.floor(q[0])===plot.x&&Math.floor(q[2])===plot.z-3);
 // The occupied door-cell waypoint may already have been consumed. Keep
 // panel-aware guidance while the body is still in that threshold, rather
 // than steering a slightly off-center heading into the open side panel.
 const p=bot.entity.position,inThreshold=Math.floor(p.x)===plot.x&&Math.floor(p.z)===plot.z-3;
 if(index<0&&!inThreshold)return null;
 // Use the actual crossing direction; the ultimate destination may be behind
 // the house, on the same side of the door plane as the starting room.
 const next=path[index<0?0:index+1],descriptor=doorwayDescriptor(bot,bot.blockAt(new Vec3(plot.x,plot.y,plot.z-3)),next||goal);
 // Only a route-checked landing can authorize stepping off a raised sill.
 if(descriptor&&next&&next[1]-plot.y<-.6&&next[1]-plot.y> -1.2)descriptor.descent=true;
 return descriptor;
}
function approachGoal(bot,goal,plot){
 if(!plot||!crossingHome(bot,goal,plot))return goal;
 const inside=insideHome(bot.entity.position,plot);
 const door=bot.blockAt(new Vec3(plot.x,plot.y,plot.z-3));
 return !door||door.name.endsWith('_door')&&!door.getProperties().open?(inside?[plot.x+.5,plot.y+.1,plot.z-1.5]:homeApproach(plot,bot)):goal;
}
function passedLanding(bot,q,next,anchor,options={}){
 const p=bot.entity.position;if(!q.centering||!next||!anchor||q.gapFrom||next.gapFrom||bot.entity.onGround!==true||Math.abs(q[1]-p.y)>.4)return false;
 const dx=q[0]-anchor[0],dz=q[2]-anchor[2],length=Math.hypot(dx,dz),nx=next[0]-q[0],nz=next[2]-q[2],span=Math.hypot(nx,nz);
 if(length<.1||span<.1)return false;
 const along=((p.x-q[0])*dx+(p.z-q[2])*dz)/length,lateral=Math.abs((p.x-q[0])*dz-(p.z-q[2])*dx)/length;
 // A descended landing is complete once grounded beyond it and the entire
 // remaining body corridor is clear, even if that corridor bends at the foot.
 const descended=q[1]-anchor[1]<-.6&&q[1]-anchor[1]>-1.2;
 if(descended&&along>=0&&along<=1.2&&lateral<=.4&&p.distanceTo(new Vec3(...q))<=1.3&&Math.abs(next[1]-p.y)<.4)return require('./route_smoothing').clearFlatLeg(bot,p,next,options);
 if(p.distanceTo(new Vec3(...q))>.65||(dx*nx+dz*nz)/(length*span)<.999)return false;
 if(along<0||along>.6||lateral>.12||!standable(bot,Math.floor(p.x),Math.round(p.y),Math.floor(p.z)))return false;
 const heading=Math.atan2(-(next[0]-p.x),-(next[2]-p.z)),probe=Math.min(.35,Math.hypot(next[0]-p.x,next[2]-p.z)),local=require('./perception').proximity(bot,{recovery:false});
 return Math.abs(next[1]-p.y)<.4?local.canWalk(heading,probe):next[1]-p.y<-.6&&next[1]-p.y> -1.2&&local.canStepDown(heading,probe);
}
class WorldNavigation{
 constructor(){this.path=[];this.destination=null;this.lastPlan=-Infinity;this.anchor=null;this.best=Infinity;this.progressAt=0;this.status={};}
 portalFor(bot,goal,plot,plots=[]){
  const p=bot.entity.position;
  if(this.exitPlot){const h=this.exitPlot,a=homeApproach(h,bot);if(Math.hypot(p.x-a[0],p.z-a[2])<.6||p.x<h.x-3.5||p.x>h.x+4.5||p.z<h.z-4||p.z>h.z+4.5)this.exitPlot=null;}
  if(!this.exitPlot){const h=plots.find(h=>!samePlot(h,plot)&&insideHome(p,h));if(h)this.exitPlot=h;}
  return this.exitPlot||plot;
 }
 plan(bot,goal,{plot=null,plots=[],bounds,now=Date.now(),memory=null,constructionWork=false}={}){
  const p=bot.entity.position,portal=this.portalFor(bot,goal,plot,plots),foreign=!!this.exitPlot;
  const exitDoor=foreign?bot.blockAt(new Vec3(portal.x,portal.y,portal.z-3)):null;
  const exitClosed=exitDoor?.name.endsWith('_door')&&!exitDoor.getProperties().open;
  // An unfinished plot has no door to open. Continue outside instead of
  // waiting forever at the interior approach for a nonexistent interaction.
  const target=foreign?(exitClosed?[portal.x+.5,portal.y+.1,portal.z-1.5]:homeApproach(portal,bot)):approachGoal(bot,goal,portal),key=target.join(','),home=homeApproach(plot,bot);
  // A bot can be on the outer strip of its plot after crafting or harvesting.
  // Always allow departure from that occupied plot; the narrower room test
  // otherwise marks every neighboring start cell forbidden and traps it.
  const occupied=[Math.floor(p.x),Math.round(p.y),Math.floor(p.z)];
  const permitted=plots.filter(h=>samePlot(h,this.exitPlot)||privatePlotCell(occupied,h)||samePlot(h,plot)&&(constructionWork||insideHome(new Vec3(...goal),h)));
  const forbidden=q=>plots.some(h=>!permitted.some(a=>samePlot(a,h))&&privatePlotCell(q,h));
  if(key!==this.destination){this.destination=key;this.path=[];this.best=Infinity;this.progressAt=now;this.lastPlan=-Infinity;this.blocked=false;}
  const previous=this.lastPosition;this.lastPosition=[p.x,p.y,p.z];
  // A waypoint crossed in midair is still the landing target. Advancing or
  // replanning before touchdown can replace it with an unsupported start cell.
  while((bot.entity.onGround!==false||this.waterRoute&&(bot.entity.isInWater||this.path[0]&&Math.hypot(this.path[0][0]-p.x,this.path[0][2]-p.z)<.45))&&this.path.length&&Math.abs(this.path[0][1]-p.y)<(this.waterRoute?1.4:.4)){
   const q=this.path[0],near=Math.hypot(q[0]-p.x,q[2]-p.z)<(this.waterRoute ? .45 : q.centering ? .15 : .4);
   const crossed=previous&&Math.abs(previous[1]-p.y)<.4&&Math.hypot(previous[0]-p.x,previous[2]-p.z)<=4&&segmentDistance({x:q[0],z:q[2]},previous,[p.x,p.y,p.z])<.12;
   // Momentum can pass a landing center before the first grounded reply.
   // Use the checked body corridor rather than returning to a passed center.
   if(!near&&!crossed&&!passedLanding(bot,q,this.path[1],this.anchor,{bounds,forbidden}))break;this.anchor=this.path.shift();
  }
  const corridor=[this.anchor||[p.x,p.y,p.z],...this.path.slice(0,3)];
  const offRoute=this.path.length&&corridorDistance(p,corridor)>.85;
  const invalid=this.path.slice(0,3).some(q=>forbidden([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])])||!(this.waterRoute?require('./water_navigation').cell(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])):standable(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2]))));
  // Keep a valid route while making progress. Periodic shortest-path swaps
  // around moving neighbors were sending bots between opposite house aisles.
  const due=now-this.lastPlan>=forBot(bot).route_replan_ms&&(!this.path.length||this.blocked||now-this.progressAt>2500);
  // Bobbing preserves a progressing swim, but a stationary water route must
  // still replan around changed obstacles and players instead of pinning forever.
  const landing=(this.waterRoute?now-this.progressAt<2500:bot.entity.onGround===false)&&this.path.length&&!invalid&&!offRoute;
  if(!landing&&(this.lastPlan===-Infinity||due||offRoute||invalid||this.waiting&&bot.entity.onGround===true)){
   // The expedition region is wider than the old 96-cell search radius.
   // Keep room beyond a distant goal for the last turn around a hill/house.
   const radius=Math.min(192,Math.max(96,Math.ceil(Math.hypot(target[0]-p.x,target[2]-p.z))+16));
   let planned=route(bot,target,radius,8192,true,{bounds,reversible:true,forbidden,allowGaps:true});this.lastPlan=now;this.anchor=[p.x,p.y,p.z];
   if(!planned.reached&&!planned.waiting_for_ground&&memory){const remembered=memory.detour(bot,target,bounds);if(remembered&&!remembered.some(q=>forbidden([Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])]))){planned={...planned,reached:true,path:remembered};memory.replans++;}}
   // A distant remembered home can be outside the client's loaded chunks.
   // Advance a short, actually checked prefix toward that unknown destination
   // instead of discarding the entire valid route. Solid blocked goals never
   // qualify, and arrival still requires the actual destination to be reached.
   const unknown=!bot.blockAt(new Vec3(Math.floor(target[0]),Math.round(target[1]),Math.floor(target[2])));
   const end=planned.path.at(-1),gain=end?Math.hypot(target[0]-p.x,target[2]-p.z)-Math.hypot(target[0]-end[0],target[2]-end[2]):0;
   if(!planned.reached&&!planned.waiting_for_ground&&(unknown||planned.budget_exhausted&&standable(bot,Math.floor(target[0]),Math.round(target[1]),Math.floor(target[2])))&&planned.path.length>=4&&gain>=4){planned={...planned,reached:true,partial:true,path:planned.path.slice(0,12)};this.best=Infinity;}
   this.waterRoute=false;
   if(!planned.reached||planned.partial||bot.entity.isInWater){
    const wet=route(bot,target,radius,8192,true,{bounds,reversible:true,forbidden,allowWater:true});
    if(wet.reached&&require('./water_navigation').validRoute(bot,wet.path,target)){planned=wet;this.waterRoute=true;}
    else if(!wet.reached&&(unknown||wet.budget_exhausted&&require('./water_navigation').cell(bot,Math.floor(target[0]),Math.round(target[1]),Math.floor(target[2]))?.wet===false)){
     // Home can be outside the loaded view, or a loaded bank can require
     // more search than one bounded water-capable plan. Accept only a short
     // checked prefix ending on dry shore, then replan as home chunks load.
     // A prefix ending in open water is never an acceptable partial return.
     const frontier=wet.path.at(-1),frontierGain=frontier?Math.hypot(target[0]-p.x,target[2]-p.z)-Math.hypot(target[0]-frontier[0],target[2]-frontier[2]):0;
     for(let length=Math.min(12,wet.path.length);length>=4;length--){
      const prefix=wet.path.slice(0,length),shore=prefix.at(-1),gain=Math.hypot(target[0]-p.x,target[2]-p.z)-Math.hypot(target[0]-shore[0],target[2]-shore[2]);
      // A checked detour may first move sideways/away around a cliff or inlet.
      // Require progress at the searched frontier, not at every short leg.
      if((gain>=4||frontierGain>=4)&&require('./water_navigation').validRoute(bot,prefix,shore)){planned={...wet,reached:true,partial:true,path:prefix};this.waterRoute=true;this.best=Infinity;break;}
     }
    }
   }
   this.path=planned.reached?planned.path:[];this.blocked=!planned.reached;
   this.partial=!!planned.partial;
   this.waiting=!!planned.waiting_for_ground;
   this.reason=this.waiting?'Waiting to land safely before replanning':planned.budget_exhausted?'Return-route search reached its limit; checking again':'No complete safe route in loaded terrain; checking for another way';
   this.expanded=planned.expanded;this.replanned=true;
  }else this.replanned=false;
  // Replace tiny grid zigzags with a short, body-safe direct leg. Remove the
  // bypassed cells so the follower never turns back to visit old grid corners.
  const smooth=this.path[0]?.gapFrom?this.path[0]:require('./route_smoothing').smoothCue(bot,p,this.path,{bounds,forbidden,allowWater:this.waterRoute});
  const skipped=this.path.indexOf(smooth);
  if(skipped>0){this.path.splice(0,skipped);this.anchor=[p.x,p.y,p.z];}
  let remaining=0,from=[p.x,p.y,p.z];for(const point of this.path){remaining+=Math.hypot(point[0]-from[0],point[2]-from[2])+Math.abs(point[1]-from[1])*.4;from=point;}
  const arrived=!this.blocked&&!this.path.length&&Math.hypot(target[0]-p.x,target[2]-p.z)<.4&&Math.abs(target[1]-p.y)<.4;
  if(!this.blocked&&(remaining<this.best-.75||arrived)){this.best=remaining;this.progressAt=now;}
  const idle=Math.max(0,(now-this.progressAt)/1000),timeout=forBot(bot).stationary_timeout_seconds;
  this.status={home,target:[...target],partial_route:!!this.partial,route_intent:foreign?'Exit neighboring house':plot&&insideHome(new Vec3(...goal),plot)?'Return to own house':'Travel outside private houses',state:this.waiting&&this.blocked?'landing':this.blocked?'blocked':arrived?'arrived':'following',height_delta:Math.round(((home||target)[1]-p.y)*10)/10,
   water_route:!!this.waterRoute,route_complete:!this.blocked,remaining_blocks:Math.round(remaining*10)/10,waypoints:this.path.length,no_progress_seconds:Math.floor(idle),reset_seconds:Math.max(0,Math.ceil(timeout-idle)),expanded:this.expanded||0};
  if(idle>=timeout)throw Error('No route progress for '+timeout+' seconds; ended this attempt instead of circling.');
  this.status.smoothed_waypoints=skipped>0?skipped:0;
  return {water_route:!!this.waterRoute,path:this.path,cue:smooth||travelCue(p,this.path)||target,corridor:[this.anchor||[p.x,p.y,p.z],...this.path.slice(0,5)],blocked:this.blocked,arrived,message:this.reason,portal};
 }
}
module.exports={WorldNavigation,homeApproach,approachGoal,corridorDistance,insideHome,crossingHome,routeDoorway,privatePlotCell,travelCue,passedLanding};

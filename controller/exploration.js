// Bounded, per-bot survey memory with shared destination reservations only.
const {Vec3}=require('vec3'),{travelRoute:route}=require('./field_navigation'),cfg=require('../config/world-resources.json');
const claims=new Map(),key=p=>Math.floor(p[0]/cfg.frontier_cell_size)+','+Math.floor(p[2]/cfg.frontier_cell_size);
class Exploration{
 constructor(){this.visits=new Map();this.depleted=new Map();this.rejected=new Map();this.tests=0;this.cycles=0;this.state='Searching';this.goal=null;}
 observe(p){const id=key([p.x,p.y,p.z]);if(this.last!==id){this.visits.set(id,(this.visits.get(id)||0)+1);this.last=id;}}
 finish(bot,kind,goal,now=Date.now()){this.depleted.set(kind+':'+key(goal),now+cfg.frontier_retry_seconds*1000);this.goal=null;claims.delete(bot.username);}
 reject(bot,goal,now=Date.now()){this.rejected.set(goal.map(Math.floor).join(','),now+cfg.frontier_retry_seconds*1000);this.goal=null;claims.delete(bot.username);}
 hold(bot,run,goal){claims.set(bot.username,{run,goal,until:Date.now()+10000});}
 async choose(bot,world,surface,known=[],kind='wood',now=Date.now()){
  const p=bot.entity.position,bounds=world.bounds,cell=cfg.frontier_cell_size,candidates=new Map(),index=world.index||0;
  const add=goal=>{
   const [x,y,z]=goal,id=goal.map(Math.floor).join(',');
   if(x<=bounds[0]+3||x>=bounds[1]-4||z<=bounds[2]+3||z>=bounds[3]-4||(this.rejected.get(id)||0)>now||(this.depleted.get(kind+':'+key(goal))||0)>now)return;
   if((world.plots||[]).some(h=>Math.abs(x-h.x-.5)<4.5&&Math.abs(z-h.z-.5)<5.5))return;
   for(const [owner,c] of claims){if(c.until<now){claims.delete(owner);continue;}if(owner!==bot.username&&c.run===world.run&&Math.hypot(c.goal[0]-x,c.goal[2]-z)<cell)return;}
   const visits=this.visits.get(key(goal))||0,angle=Math.atan2(z-p.z,x-p.x),bias=Math.abs(Math.atan2(Math.sin(angle-index*Math.PI/4),Math.cos(angle-index*Math.PI/4)));
   const livestock=goal.known&&['wool','food'].includes(kind);
   const distance=Math.hypot(x-p.x,z-p.z),score=(livestock?0:visits*35)+distance*.25+bias*3-(livestock?100:goal.known?12:0);
   if(distance>=(goal.known?3:8))candidates.set(id,{goal,score});
  };
  for(const g of known){const q=[...g];q.known=true;add(q);}
  // Sample the entire loaded expedition region, not only the first nearby ring.
  let sampled=0;
  for(let x=bounds[0]+6;x<bounds[1]-4;x+=cell)for(let z=bounds[2]+6;z<bounds[3]-4;z+=cell){
   if(Math.hypot(x+.5-p.x,z+.5-p.z)>80)continue;
   const y=surface(bot,x,z);if(y!==null)add([x+.5,y+.1,z+.5]);
   if(++sampled%16===0)await new Promise(r=>setImmediate(r));
  }
  const ordered=[...candidates.values()].sort((a,b)=>a.score-b.score);this.available=ordered.length;this.cycles++;
  this.state='Testing routes to unvisited terrain';
  for(const {goal} of ordered.slice(0,cfg.frontier_route_budget)){
   this.tests++;const plan=route(bot,goal,96,2048,true,{bounds,reversible:true});
   if(plan.reached){this.goal=goal;this.state=goal.known?'Checking a remembered resource':'Exploring a less visited patch';this.hold(bot,world.run,goal);return goal;}
   this.rejected.set(goal.map(Math.floor).join(','),now+cfg.frontier_retry_seconds*1000);await new Promise(r=>setImmediate(r));
  }
  this.state=ordered.length?'Checking the next search destinations':'No safe unexplored destination in loaded terrain';return null;
 }
 snapshot(p,home){return {state:this.state,visited_cells:this.visits.size,depleted_cells:this.depleted.size,available_destinations:this.available||0,routes_tested:this.tests,goal:this.goal?this.goal.slice(0,3):null,goal_distance:this.goal?Math.round(Math.hypot(p.x-this.goal[0],p.z-this.goal[2])):null,home_distance:home?Math.round(Math.hypot(p.x-home.x-.5,p.z-home.z-.5)):null};}
}
function release(name){claims.delete(name);}
module.exports={Exploration,release};

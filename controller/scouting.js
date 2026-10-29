// Revisit observed resource sites from real ground, not the height of an upper log.
const {Vec3}=require('vec3'),{standable}=require('./field_navigation'),{WorldNavigation,privatePlotCell}=require('./world_navigation');
function candidates(bot,memory,plot,plots,bounds,surface){
 surface=surface||require('./hut_teacher').surface;
 const home=[plot.x+.5,plot.y+.1,plot.z+.5],groups=new Map(),result=[],seen=new Set();
 for(const r of memory.resources){
  if(!['wood','stone'].includes(r.kind)||Math.hypot(r.position[0]-home[0],r.position[2]-home[2])<8)continue;
  const id=r.kind+':'+Math.floor(r.position[0])+','+Math.floor(r.position[2]);
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);
 }
 const ordered=[...groups.values()].sort((a,b)=>Math.hypot(a[0].position[0]-home[0],a[0].position[2]-home[2])-Math.hypot(b[0].position[0]-home[0],b[0].position[2]-home[2]));
 // Collapse vertical log stacks before limiting approaches per distinct site.
 for(const group of ordered){
  const r=group[0],x=Math.floor(r.position[0]),z=Math.floor(r.position[2]),local=new Map();
  const add=g=>{
   const [gx,gy,gz]=g;if(Math.hypot(gx-x-.5,gz-z-.5)>4)return;if(gx<=bounds[0]+2||gx>=bounds[1]-3||gz<=bounds[2]+2||gz>=bounds[3]-3||Math.hypot(gx-home[0],gz-home[2])<8)return;
   if(!group.some(v=>Math.abs(v.position[1]-gy)<=(r.kind==='wood'?12:4)))return;
   if(plots.some(h=>privatePlotCell([Math.floor(gx),Math.round(gy),Math.floor(gz)],h)))return;
   if(standable(bot,Math.floor(gx),Math.round(gy),Math.floor(gz)))local.set(g.join(','),g);
  };
  for(const v of group)if(v.approach)add(v.approach);
  for(const road of memory.roads?.values()||[])if(Math.hypot(road[0]-x-.5,road[2]-z-.5)<=4)add(road);
  for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]){
   const y=surface(bot,x+dx,z+dz);if(y!==null)add([x+dx+.5,y+.1,z+dz+.5]);
  }
  for(const goal of [...local.values()].sort((a,b)=>new Vec3(...a).distanceTo(bot.entity.position)-new Vec3(...b).distanceTo(bot.entity.position)).slice(0,4)){
   const id=goal.join(',');if(!seen.has(id)){seen.add(id);result.push({goal,kind:r.kind,resource:[...r.position]});}
  }
 }
 return result.slice(0,192);
}
function choose(bot,t,world,surface,now=Date.now()){
 const n=t.wilderness;
 if(!n.scoutPlanning)n.scoutPlanning={goals:candidates(bot,n.memory,t.plot,t.campPlots||[],world.bounds,surface),cursor:0,checked:0};
 // Keep the cursor between ticks: blocked near sites must not hide later sites.
 const state=n.scoutPlanning;n.scoutRejected??=new Set();
 for(let budget=0;budget<4&&state.cursor<state.goals.length;budget++){
  const c=state.goals[state.cursor++];state.checked++;
  if(n.scoutRejected.has(c.goal.join(','))||!standable(bot,Math.floor(c.goal[0]),Math.round(c.goal[1]),Math.floor(c.goal[2])))continue;
  const nav=new WorldNavigation(),plan=nav.plan(bot,c.goal,{plot:t.plot,plots:t.campPlots||[],bounds:world.bounds,now});
  if(!plan.blocked){n.scoutLandmark=c;return c.goal;}
 }
 return null;
}
module.exports={candidates,choose};

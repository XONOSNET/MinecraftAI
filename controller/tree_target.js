const {route}=require('./field_navigation'),space=require('./resource_space'),{Vec3}=require('vec3'),{withinReach}=require('./resource_target');
// Choose once from a bounded set of reachable trees, then retain the trunk lock.
function chooseTree(bot,targets,previous,surface,run,previousApproach=null){
 const groups=new Map(),p=bot.entity.position;
 for(const v of targets){const id=v.x+','+v.z;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(v);}
 if(previousApproach&&groups.has(previous)&&!space.busy(bot,run,groups.get(previous)[0].offset(.5,0,.5))&&groups.get(previous).some(b=>withinReach(bot,b,new Vec3(...previousApproach))))return {key:previous,targets:groups.get(previous),approach:previousApproach};
 const ordered=[...groups].filter(([,blocks])=>!space.busy(bot,run,blocks[0].offset(.5,0,.5))).sort((a,b)=>Math.hypot(a[1][0].x+.5-p.x,a[1][0].z+.5-p.z)-Math.hypot(b[1][0].x+.5-p.x,b[1][0].z+.5-p.z));
 ordered.sort((a,b)=>Number(b[0]===previous)-Number(a[0]===previous));
 for(const [id,blocks] of ordered.slice(0,6)){
  const trunk=blocks[0];if(space.busy(bot,run,trunk.offset(.5,0,.5)))continue;
  const approaches=[];
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2],[3,0],[-3,0],[0,3],[0,-3]]){
   const y=surface(bot,trunk.x+dx,trunk.z+dz);
   if(y!==null&&blocks.some(b=>withinReach(bot,b,new Vec3(trunk.x+dx+.5,y+.1,trunk.z+dz+.5)))){
    const goal=[trunk.x+dx+.5,y+.1,trunk.z+dz+.5];
    if(space.clearOfPlayers(bot,{x:goal[0],y:goal[1],z:goal[2]})&&blocks.some(b=>require('./resource_access').corridor(bot,b,new Vec3(...goal)).clear))approaches.push(goal);
   }
  }
  approaches.sort((a,b)=>Math.hypot(a[0]-p.x,a[2]-p.z)-Math.hypot(b[0]-p.x,b[2]-p.z));
  for(const goal of approaches.slice(0,2))if(route(bot,goal,32,512,true,{reversible:true}).reached)return {key:id,targets:blocks,approach:goal};
 }
 // Build-up candidates still require a real reversible ground route and spare blocks.
 if(bot.inventory?.items().some(i=>require('./resource_access').material(i.name)&&i.count>0))for(const [id,blocks] of ordered.slice(0,6)){
  const trunk=blocks[0];
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const y=surface(bot,trunk.x+dx,trunk.z+dz);if(y===null||!blocks.some(b=>b.y-y>=3&&b.y-y<=7))continue;
   const goal=[trunk.x+dx+.5,y+.1,trunk.z+dz+.5];
   if(space.clearOfPlayers(bot,new Vec3(...goal))&&route(bot,goal,32,512,true,{reversible:true}).reached)return {key:id,targets:blocks,approach:goal};
  }
 }
 return {key:null,targets:[],rejected:ordered.slice(0,6).map(([id])=>id)};
}
module.exports={chooseTree};

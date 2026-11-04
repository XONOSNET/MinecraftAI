// Prefer an earned intact home when its checked approach is reasonably close.
const {Vec3}=require('vec3'),{travelRoute}=require('./field_navigation'),{homeApproach,privatePlotCell,insideHome}=require('./world_navigation');
const MAX_DISTANCE=32,MAX_ROUTE=48;
function homeReachable(t,b,w){
 const h=t.plot,p=b.entity.position;
 if(!h||!t.milestones.includes('hut')||t.homeDamage?.unsafe||p.distanceTo(new Vec3(h.x+.5,h.y,h.z+.5))>MAX_DISTANCE)return false;
 const enemies=require('./shelter_policy').threats(b);if(enemies.some(e=>insideHome(e.position,h)))return false;
 if(insideHome(p,h))return true;
 const key=[h.x,h.y,h.z,...p.floored().toArray(),...enemies.flatMap(e=>[e.id,...e.position.floored().toArray()])].join(','),now=Date.now();
 const memo=t.wilderness?.homeRefuge;if(memo?.key===key&&now-memo.at<1000)return memo.reachable;
 const goal=homeApproach(h,b),route=travelRoute(b,goal,48,4096,true,{bounds:w.bounds,reversible:true,forbidden:q=>(t.campPlots||[]).some(other=>(other.x!==h.x||other.z!==h.z)&&privatePlotCell(q,other))||enemies.some(e=>e.position.distanceTo(new Vec3(q[0]+.5,q[1]+.1,q[2]+.5))<Math.min(e.name==='creeper'?4:2,Math.max(1,e.position.distanceTo(p)-.75)))});
 let distance=0,previous=p;for(const q of route.path){const next=new Vec3(...q);distance+=next.distanceTo(previous);previous=next;}
 const reachable=!!route.reached&&distance<=MAX_ROUTE;
 if(t.wilderness)t.wilderness.homeRefuge={key,at:now,reachable};return reachable;
}
module.exports={homeReachable,MAX_DISTANCE,MAX_ROUTE};

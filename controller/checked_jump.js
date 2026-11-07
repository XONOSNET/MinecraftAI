const {Vec3}=require('vec3'),space=require('./resource_space');
const air=b=>b&&['air','cave_air','void_air','short_grass'].includes(b.name);
function gap(b,from,to,{bounds,forbidden}={}){
 const dx=to[0]-from[0],dz=to[2]-from[2];if(from[1]!==to[1]||Math.abs(dx)+Math.abs(dz)!==2||dx&&dz)return false;
 const middle=[from[0]+dx/2,from[1],from[2]+dz/2];
 if(!air(b.blockAt(new Vec3(middle[0],middle[1]-1,middle[2]))))return false;
 const nav=require('./field_navigation');if(!nav.standable(b,...from)||!nav.standable(b,...to))return false;
 for(const q of [from,middle,to]){
  if(bounds&&(q[0]+.5<=bounds[0]+1||q[0]+.5>=bounds[1]-2||q[2]+.5<=bounds[2]+1||q[2]+.5>=bounds[3]-2)||forbidden?.(q))return false;
  for(let y=q[1];y<=q[1]+3;y++)if(!air(b.blockAt(new Vec3(q[0],y,q[2]))))return false;
 }
 return space.stepClear(new Vec3(from[0]+.5,from[1],from[2]+.5),new Vec3(to[0]+.5,to[1],to[2]+.5),space.players(b),1);
}
function step(b,goal){
 const p=b.entity.position,to=[Math.floor(goal[0]),Math.round(goal[1]),Math.floor(goal[2])],from=[Math.floor(p.x),Math.round(p.y),Math.floor(p.z)];
 return to[1]-from[1]===1&&Math.abs(to[0]-from[0])+Math.abs(to[2]-from[2])===1&&require('./field_navigation').standable(b,...to)&&air(b.blockAt(new Vec3(from[0],from[1]+2,from[2])));
}
module.exports={gap,step};

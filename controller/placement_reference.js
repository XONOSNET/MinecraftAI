// A supporting block alone is insufficient: its clicked face must be reachable.
const {Vec3}=require('vec3');
const interactive=n=>['crafting_table','chest','trapped_chest','barrel','furnace','blast_furnace','smoker','hopper','dispenser','dropper','enchanting_table','brewing_stand','anvil','chipped_anvil','damaged_anvil','lectern'].includes(n)||n.endsWith('_door')||n.endsWith('_trapdoor')||n.endsWith('_shulker_box');
function references(bot,q,{standing=bot.entity?.position,exclude=new Set(),visibleOnly=false}={}){
 const eye=standing?.offset(0,bot.entity?.eyeHeight||1.62,0),result=[];
 for(const [dx,dy,dz] of [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]){
  const block=bot.blockAt(new Vec3(q.x+dx,q.y+dy,q.z+dz));
  if(!block||block.boundingBox!=='block'||interactive(block.name))continue;
  const face=new Vec3(-dx,-dy,-dz),key=block.position.toString()+':'+face.toString();if(exclude.has(key))continue;
  const delta=new Vec3(.5+face.x*.5,.5+face.y*.5,.5+face.z*.5),point=block.position.plus(delta);
  let visible=true;
  if(eye){
   const ray=point.minus(eye),distance=ray.norm();if(distance>4.2||distance<.01)continue;
   // Prefer the exposed side of the supporting face. Probe just inside to
   // avoid boundary ties when testing visibility.
   visible=eye.minus(point).dot(face)>.001;
   if(visible&&bot.world?.raycast){const hit=bot.world.raycast(eye,ray.scaled(1/distance),distance+.02);visible=!!hit?.position?.equals(block.position)&&(!hit.intersect||hit.intersect.distanceTo(point)<=.04);}
  }
  if(!visibleOnly||visible)result.push({block,face,point,delta,key,visible});
 }
 // Vanilla accepts an in-reach face packet without a direct camera ray. Keep
 // that existing construction assist for overhead ceilings, after visible faces.
 return result.sort((a,b)=>Number(b.visible)-Number(a.visible));
}
module.exports={references,reference:(bot,q,options)=>references(bot,q,options)[0]||null};

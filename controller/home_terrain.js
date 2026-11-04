// Bounded backfill for damaged homes, using real carried blocks only.
const {Vec3}=require('vec3');
const FILL=['dirt','coarse_dirt','cobblestone','cobbled_deepslate','andesite','diorite','granite','netherrack'];
const air=b=>b&&['air','cave_air','void_air','light'].includes(b.name);
function solid(b){return !!b&&b.boundingBox==='block'&&!['sand','red_sand','gravel','magma_block','campfire','soul_campfire'].includes(b.name)&&!b.getProperties?.().waterlogged&&(!b.shapes||b.shapes.some(s=>s.length===6&&s.every((n,i)=>n===(i<3?0:1))));}
function owned(t,x,z){return !(t.campPlots||[]).some(h=>(h.x!==t.plot.x||h.z!==t.plot.z)&&Math.abs(x-h.x)<=3&&Math.abs(z-h.z)<=3);}
function plan(t,b){
 const h=t.plot,result=[];
 for(let dx=-3;dx<=3;dx++)for(let dz=-5;dz<=3;dz++){
  if(dz<-3&&Math.abs(dx)>1)continue;
  const x=h.x+dx,z=h.z+dz;if(!owned(t,x,z))continue;
  // An intact floor/ground cell is not permission to fill a natural cave below it.
  if(!air(b.blockAt(new Vec3(x,h.y-1,z))))continue;
  const interior=Math.abs(dx)<=2&&Math.abs(dz)<=2,top=h.y-(interior?2:1),column=[];
  let anchored=false;
  for(let y=top;y>=h.y-6;y--){
   const v=b.blockAt(new Vec3(x,y,z));
   if(solid(v)){anchored=true;break;}
   if(!air(v))break;
   column.push({x,y,z,kind:'foundation',structural:true,terrain:true});
  }
  // Never cap fluids, unknown chunks or a deep cavern with floating fill.
  if(anchored)result.push(...column.reverse());
 }
 return result;
}
function available(b,reserve=0){const items=b.inventory.items();return items.filter(i=>FILL.includes(i.name)&&i.name!=='cobblestone').reduce((s,i)=>s+i.count,0)+Math.max(0,items.filter(i=>i.name==='cobblestone').reduce((s,i)=>s+i.count,0)-reserve);}
function material(b,reserve=0){
 for(const name of FILL){const n=b.inventory.items().filter(i=>i.name===name).reduce((s,i)=>s+i.count,0);if(n>(name==='cobblestone'?reserve:0))return name;}
 return b.inventory.items().find(i=>i.name.endsWith('_planks'))?.name;
}
module.exports={plan,solid,owned,available,material,FILL};

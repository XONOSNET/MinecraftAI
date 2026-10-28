// Scan loaded chunk palettes at relevant heights, yielding between columns.
const {Vec3}=require('vec3');
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
async function loadedMatches(bot,{match=LOG,minDy=-5,maxDy=8,accept=null,range=64,count=256,bounds=null,yieldNow=()=>new Promise(resolve=>setImmediate(resolve))}={}){
 if(!bot.world?.getColumn||!bot.registry?.blocksByStateId)return bot.findBlocks({matching:b=>match.test(b.name),useExtraInfo:b=>b.position.y>bot.entity.position.y+minDy&&b.position.y<bot.entity.position.y+maxDy&&(!accept||accept(bot,b.position)),maxDistance:range,count});
 const p=bot.entity.position.clone(),center=p.floored(),y0=Math.floor(p.y+minDy)+1,y1=Math.ceil(p.y+maxDy)-1,minY=bot.game.minY,found=[],cache=new Map(),local=new Vec3(0,0,0);
 const isLog=id=>{if(!cache.has(id))cache.set(id,match.test(bot.registry.blocksByStateId[id]?.name||''));return cache.get(id);};
 for(let cx=Math.floor((center.x-range)/16);cx<=Math.floor((center.x+range)/16);cx++)for(let cz=Math.floor((center.z-range)/16);cz<=Math.floor((center.z+range)/16);cz++){
  if(bounds&&(cx*16+15<bounds[0]||cx*16>=bounds[1]||cz*16+15<bounds[2]||cz*16>=bounds[3]))continue;
  const column=bot.world.getColumn(cx,cz);if(!column)continue;
  for(let sy=Math.floor(y0/16);sy<=Math.floor(y1/16);sy++){
   const section=column.sections[sy-(minY>>4)];if(!section||section.palette&&!section.palette.some(isLog))continue;
   for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=Math.max(y0,sy*16);y<=Math.min(y1,sy*16+15);y++){
    const dx=cx*16+x-center.x,dz=cz*16+z-center.z;if(dx*dx+dz*dz+(y-center.y)**2>range*range)continue;
    local.x=x;local.y=y;local.z=z;
    if(isLog(column.getBlockStateId(local))){const v=new Vec3(cx*16+x,y,cz*16+z);if(!accept||accept(bot,v))found.push(v);}
   }
  }
  await yieldNow();
 }
 return found.sort((a,b)=>a.distanceTo(center)-b.distanceTo(center)).slice(0,count);
}
const logs=(bot,options={})=>loadedMatches(bot,options);
const stone=(bot,options={})=>loadedMatches(bot,{range:40,minDy:-2,maxDy:4,...options,match:/^stone$/,accept:(b,p)=>{const neighbors=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]].map(([x,y,z])=>b.blockAt(p.offset(x,y,z)));return neighbors.every(q=>q&&!['water','lava'].includes(q.name))&&neighbors.slice(0,5).some(q=>q.boundingBox==='empty');}});
module.exports={logs,stone};

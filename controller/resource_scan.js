// Scan loaded chunk palettes at relevant heights, yielding between columns.
const {Vec3}=require('vec3');
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
async function logs(bot,{range=64,count=256,bounds=null,yieldNow=()=>new Promise(resolve=>setImmediate(resolve))}={}){
 if(!bot.world?.getColumn||!bot.registry?.blocksByStateId)return bot.findBlocks({matching:b=>LOG.test(b.name),useExtraInfo:b=>Math.abs(b.position.y-bot.entity.position.y)<5,maxDistance:range,count});
 const p=bot.entity.position.clone(),center=p.floored(),y0=Math.floor(p.y-5)+1,y1=Math.ceil(p.y+5)-1,minY=bot.game.minY,found=[],cache=new Map(),local=new Vec3(0,0,0);
 const isLog=id=>{if(!cache.has(id))cache.set(id,LOG.test(bot.registry.blocksByStateId[id]?.name||''));return cache.get(id);};
 for(let cx=Math.floor((center.x-range)/16);cx<=Math.floor((center.x+range)/16);cx++)for(let cz=Math.floor((center.z-range)/16);cz<=Math.floor((center.z+range)/16);cz++){
  if(bounds&&(cx*16+15<bounds[0]||cx*16>=bounds[1]||cz*16+15<bounds[2]||cz*16>=bounds[3]))continue;
  const column=bot.world.getColumn(cx,cz);if(!column)continue;
  for(let sy=Math.floor(y0/16);sy<=Math.floor(y1/16);sy++){
   const section=column.sections[sy-(minY>>4)];if(!section||section.palette&&!section.palette.some(isLog))continue;
   for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=Math.max(y0,sy*16);y<=Math.min(y1,sy*16+15);y++){
    const dx=cx*16+x-center.x,dz=cz*16+z-center.z;if(dx*dx+dz*dz+(y-center.y)**2>range*range)continue;
    local.x=x;local.y=y;local.z=z;
    if(isLog(column.getBlockStateId(local)))found.push(new Vec3(cx*16+x,y,cz*16+z));
   }
  }
  await yieldNow();
 }
 return found.sort((a,b)=>a.distanceTo(center)-b.distanceTo(center)).slice(0,count);
}
module.exports={logs};

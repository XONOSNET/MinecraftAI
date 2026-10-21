const {Vec3}=require('vec3');
function scan(bot,{rays=256,range=16,hfov=Math.PI/2,vfov=Math.PI/3}={}) {
 const cols=Math.ceil(Math.sqrt(rays*1.5)), rows=Math.ceil(rays/cols);
 const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0), hits=[], features=[];
 for(let i=0;i<rays;i++){
  const yaw=bot.entity.yaw+((i%cols)/(cols-1)-.5)*hfov;
  const pitch=bot.entity.pitch+(Math.floor(i/cols)/(rows-1)-.5)*vfov;
  const dir=new Vec3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const hit=bot.world.raycast(eye,dir,range);
  const d=hit?eye.distanceTo(hit.intersect):range;
  features.push(d/range,hit?1:0);
  if(hit)hits.push({name:hit.name,id:hit.type,position:hit.position,hit:hit.intersect,distance:d,face:hit.face});
 }
 // Pool groups of eight rays; fixed 64 floats, preserving depth and hit occupancy.
 const pooled=[];for(let i=0;i<32;i++){let depth=1,occ=0;const begin=Math.floor(i*rays/32),end=Math.floor((i+1)*rays/32);for(let j=begin;j<end;j++){depth=Math.min(depth,features[j*2]);occ+=features[j*2+1]/Math.max(1,end-begin);}pooled.push(depth,occ);}
 return {pooled,hits:[...new Map(hits.map(h=>[`${h.position.x},${h.position.y},${h.position.z}`,h])).values()],features};
}
module.exports={scan};

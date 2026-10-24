const {Vec3}=require('vec3');
const HAZARDS=new Set(['lava','water','magma_block','fire','campfire','sweet_berry_bush']);
function proximity(bot){
 const blockAt=bot.blockAt?point=>bot.blockAt(point):bot.world?.getBlock?point=>bot.world.getBlock(point):()=>null;
 const p=bot.entity.position,yaw=bot.entity.yaw,f=new Vec3(-Math.sin(yaw),0,-Math.cos(yaw));
 // Collision boxes distinguish a crouch-sized opening from an ordinary solid wall.
 function blocked(distance,height,bottom=.05){
  const c=p.plus(f.scaled(distance));
  for(let x=Math.floor(c.x-.29);x<=Math.floor(c.x+.29);x++)for(let z=Math.floor(c.z-.29);z<=Math.floor(c.z+.29);z++)
   for(let y=Math.floor(p.y+.05);y<=Math.floor(p.y+height);y++){
    const b=blockAt(new Vec3(x,y,z));if(!b)return true;
    const shapes=b.shapes||(b.boundingBox==='block'?[[0,0,0,1,1,1]]:[]);
    if(shapes.some(a=>x+a[0]<c.x+.29&&x+a[3]>c.x-.29&&z+a[2]<c.z+.29&&z+a[5]>c.z-.29&&y+a[1]<p.y+height&&y+a[4]>p.y+bottom))return true;
   }
  return false;
 }
 const distances=[.35,.65,.95],standing=distances.some(d=>blocked(d,1.79)),crouched=distances.some(d=>blocked(d,1.49));
 const rearSafe=[0,-.4,-.8].every(d=>{const c=p.plus(f.scaled(d));const ground=blockAt(c.offset(0,-.15,0));return ground&&ground.boundingBox==='block'&&!HAZARDS.has(ground.name)&&!blocked(d,1.79);});
 return {wallAhead:standing&&crouched&&distances.some(d=>blocked(d,1.49,1.05)),crouchClearance:standing&&!crouched,rearSafe:rearSafe&&!bot.entity.isInWater&&!bot.entity.isInLava};
}
function coneWidth(distance){return Math.PI/2+Math.PI/3*Math.max(0,Math.min(1,(5-distance)/4));}
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
 // Preserve the learned central 90-degree ray layout. Add peripheral awareness
 // rather than remapping the saved network's 64 depth inputs.
 const center=new Vec3(-Math.sin(bot.entity.yaw),0,-Math.cos(bot.entity.yaw));
 const near=bot.world.raycast(eye,center,range),nearDistance=near?eye.distanceTo(near.intersect):range;
 const cone=coneWidth(nearDistance);
 for(const side of [-1,1])for(let j=1;j<=8;j++){
  const yaw=bot.entity.yaw+side*(hfov/2+(cone-hfov)/2*j/8),dir=new Vec3(-Math.sin(yaw),0,-Math.cos(yaw));
  const hit=bot.world.raycast(eye,dir,range);
  if(hit)hits.push({name:hit.name,id:hit.type,position:hit.position,hit:hit.intersect,distance:eye.distanceTo(hit.intersect),face:hit.face});
 }
 return {proximity:proximity(bot),vision:{yaw:bot.entity.yaw,pitch:0,hfov:cone,vfov,range,near_distance:nearDistance,eye_height:eye.y-bot.entity.position.y},pooled,hits:[...new Map(hits.map(h=>[`${h.position.x},${h.position.y},${h.position.z}`,h])).values()],features};
}
module.exports={scan,proximity,coneWidth};

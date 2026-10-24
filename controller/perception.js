const {Vec3}=require('vec3');
const HAZARDS=new Set(['lava','water','magma_block','fire','campfire','sweet_berry_bush']);
function proximity(bot,{goalYaw=null}={}){
 const blockAt=bot.blockAt?point=>bot.blockAt(point):bot.world?.getBlock?point=>bot.world.getBlock(point):()=>null;
 const p=bot.entity.position,yaw=bot.entity.yaw,f=new Vec3(-Math.sin(yaw),0,-Math.cos(yaw));
 // Collision boxes distinguish a crouch-sized opening from an ordinary solid wall.
 function blocked(distance,height,bottom=.05,direction=f,baseY=p.y){
  const c=p.plus(direction.scaled(distance));
  for(let x=Math.floor(c.x-.29);x<=Math.floor(c.x+.29);x++)for(let z=Math.floor(c.z-.29);z<=Math.floor(c.z+.29);z++)
   for(let y=Math.floor(baseY+.05);y<=Math.floor(baseY+height);y++){
    const b=blockAt(new Vec3(x,y,z));if(!b)return true;
    const shapes=b.shapes||(b.boundingBox==='block'?[[0,0,0,1,1,1]]:[]);
    if(shapes.some(a=>x+a[0]<c.x+.29&&x+a[3]>c.x-.29&&z+a[2]<c.z+.29&&z+a[5]>c.z-.29&&y+a[1]<baseY+height&&y+a[4]>baseY+bottom))return true;
   }
  return false;
 }
 const distances=[.35,.65,.95],standing=distances.some(d=>blocked(d,1.79)),crouched=distances.some(d=>blocked(d,1.49));
 const rearSafe=[0,-.4,-.8].every(d=>{const c=p.plus(f.scaled(d));const ground=blockAt(c.offset(0,-.15,0));return ground&&ground.boundingBox==='block'&&!HAZARDS.has(ground.name)&&!blocked(d,1.79);});
 const wallAhead=standing&&crouched&&distances.some(d=>blocked(d,1.49,1.05));
 // Resolve real collision surfaces (soul sand, slabs, stairs), rather than
 // assuming that support must end at an integer Y coordinate.
 function supportAt(x,z,maxDrop){
  const minY=p.y-maxDrop-.05,maxY=p.y+.6+.001;let best=null;
  for(let y=Math.floor(maxY);y>=Math.floor(minY)-1;y--){
   const block=blockAt(new Vec3(Math.floor(x),y,Math.floor(z)));
   if(!block)return null;
   if(HAZARDS.has(block.name))return null;
   const at=block.position||new Vec3(Math.floor(x),y,Math.floor(z));
   for(const a of block.shapes||(block.boundingBox==='block'?[[0,0,0,1,1,1]]:[])){
    const top=at.y+a[4],lx=x-at.x,lz=z-at.z;
    if(top>=minY&&top<=maxY&&lx>=a[0]&&lx<=a[3]&&lz>=a[2]&&lz<=a[5]&&(best===null||top>best))best=top;
   }
   if(best!==null)break;
  }
  return best;
 }
 function clearance(offset,maxDrop=.2,limit=2,height=1.79){
  if(bot.entity.isInWater||bot.entity.isInLava||bot.entity.onGround===false)return 0;
  const direction=new Vec3(-Math.sin(yaw+offset),0,-Math.cos(yaw+offset));let clear=0;
  for(const d of [...[.35,.65,.95,1.25,1.6,2].filter(d=>d<limit),limit]){
   const c=p.plus(direction.scaled(d)),supports=[];let supported=true;
   for(const x of [-.25,.25])for(const z of [-.25,.25]){
    const top=supportAt(c.x+x,c.z+z,maxDrop);
    if(top===null){supported=false;break;}supports.push(top);
   }
   if(!supported||supports.length!==4)break;
   const floor=Math.max(...supports);
   if(blocked(d,height,.05,direction,floor))break;
   // Check the whole landing/fall corridor for contact hazards.
   for(const x of [-.25,.25])for(const z of [-.25,.25])for(let y=Math.floor(Math.min(floor,p.y));y<=Math.floor(Math.max(floor,p.y)+height);y++){
    const block=blockAt(new Vec3(Math.floor(c.x+x),y,Math.floor(c.z+z)));
    if(!block||HAZARDS.has(block.name))supported=false;
   }
   if(!supported)break;clear=d;
  }
  return clear;
 }
 const forwardClearance=wallAhead||bot.labRecovering||bot.labAvoiding?clearance(0):null;
 const escapeRoutes=wallAhead||bot.labRecovering||bot.labAvoiding?[-7,-6,-5,-4,-3,-2,2,3,4,5,6,7,8].map(i=>i*Math.PI/8).map(offset=>({yaw:yaw+offset,offset,clearance:clearance(offset)})):[];
 return {wallAhead,crouchClearance:standing&&!crouched,rearSafe:rearSafe&&!bot.entity.isInWater&&!bot.entity.isInLava,
  canWalk:(heading,minimum=.35,height=1.79)=>clearance(heading-yaw,.2,minimum,height)>=minimum,canStepDown:(heading,minimum=.35)=>clearance(heading-yaw,1,minimum)>=minimum,escapeRoutes,forwardClearance,goalClearance:Number.isFinite(goalYaw)&&(wallAhead||bot.labRecovering||bot.labAvoiding)?clearance(goalYaw-yaw):null,escapeForwardSafe:forwardClearance!==null&&forwardClearance>=.65};
}
function coneWidth(distance){return Math.PI/2+Math.PI/3*Math.max(0,Math.min(1,(5-distance)/4));}
function scan(bot,{rays=256,range=16,hfov=Math.PI/2,vfov=Math.PI/3,goalYaw=null}={}) {
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
 return {proximity:proximity(bot,{goalYaw}),vision:{yaw:bot.entity.yaw,pitch:0,hfov:cone,vfov,range,near_distance:nearDistance,eye_height:eye.y-bot.entity.position.y},pooled,hits:[...new Map(hits.map(h=>[`${h.position.x},${h.position.y},${h.position.z}`,h])).values()],features};
}
module.exports={scan,proximity,coneWidth};

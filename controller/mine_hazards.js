const {Vec3}=require('vec3'),inventory=require('./inventory_sync'),space=require('./resource_space');
const reserve=['cobblestone','cobbled_deepslate','dirt','stone','deepslate'];
const air=v=>['air','cave_air','void_air'].includes(v?.name);
const adjacent=[[1,0],[-1,0],[0,1],[0,-1]];
function fluid(b,q){
 let water=false;
 for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=-1;y<=2;y++){
  const v=b.blockAt(q.offset(x,y,z));if(v?.name==='lava')return 'lava';
  if(v?.name==='water'||v?.getProperties?.().waterlogged)water=true;
 }
 return water?'water':null;
}
function cave(b,from,to,path){
 const explored=new Set(path.map(q=>q.join(',')));
 const eyes=b.entity.position.offset(0,b.entity.eyeHeight||1.62,0);
 for(const [dx,dz] of adjacent){
  const q=to.offset(dx,0,dz);
  if(q.x===from.x&&q.z===from.z||explored.has(q.toArray().join(','))||!air(b.blockAt(q))||!air(b.blockAt(q.offset(0,1,0))))continue;
  const ray=q.offset(.5,.7,.5).minus(eyes),distance=ray.norm();
  if(distance>4.2||!distance)continue;
  const hit=b.world.raycast(eyes,ray.scaled(1/distance),distance);
  if(!hit||hit.intersect?.distanceTo(eyes)>distance-.15)return q;
 }
 return null;
}
function canSurvey(b,landing){
 const {rules,count,usable}=require('./shelter_work');
 const light=b.blockAt(landing)?.light;
 return b.health>=18&&b.food>=17&&Number.isFinite(light)&&light>=rules.minimum_block_light&&
  count(b,'torch')>=4&&usable(b,'shield',45,rules.combat.min_shield_durability)&&
  (b.inventory.slots||[]).slice(5,9).filter(i=>i&&/^(iron|diamond|netherite)_/.test(i.name)).length>=3&&
  b.inventory.items().filter(i=>reserve.includes(i.name)).reduce((sum,i)=>sum+i.count,0)>rules.repair_blocks&&
  require('./field_navigation').standable(b,landing.x,landing.y,landing.z)&&!require('./shelter_policy').threats(b).length;
}
async function seal(b,motor,target,minimum){
 const p=b.entity.position,v=b.blockAt(target);
 if(!v||!['air','cave_air','water'].includes(v.name)||fluid(b,target)==='lava'||
    !b.entity.onGround||b.entity.isInWater||p.distanceTo(target.offset(.5,.5,.5))>3.5||
    Math.hypot(p.x-target.x-.5,p.z-target.z-.5)<.8||!space.clearOfPlayers(b,target.offset(.5,.5,.5),1))return false;
 const carried=b.inventory.items().filter(i=>reserve.includes(i.name));
 if(carried.reduce((sum,i)=>sum+i.count,0)<=minimum)return false;
 const Item=carried[0];
 for(const face of [new Vec3(0,1,0),...adjacent.map(([x,z])=>new Vec3(x,0,z))]){
  const support=b.blockAt(target.minus(face));
  if(support?.boundingBox!=='block'||support.getProperties?.().waterlogged)continue;
  if(!require('./target_scan').visibleBlock(b,support))continue;
  motor.pause();await inventory.equip(b,Item.name);
  if(!['air','cave_air','water'].includes(b.blockAt(target)?.name)||fluid(b,target)==='lava')return false;
  try{await b.placeBlock(support,face);}catch{ /* The block update decides whether the seal worked. */ }
  return b.blockAt(target)?.name===Item.name;
 }
 return false;
}
module.exports={fluid,cave,canSurvey,seal};

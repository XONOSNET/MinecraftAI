// Surface-only water transit. Construction/mining still require dry footing.
const {Vec3}=require('vec3'),space=require('./resource_space');
const HAZARDS=new Set(['lava','fire','soul_fire','magma_block','campfire','soul_campfire','bubble_column','powder_snow','cactus']);
const AQUATIC=new Set(['seagrass','tall_seagrass','kelp','kelp_plant']);
// These non-colliding plants contain source water in vanilla physics. They
// are swimming cells, never dry land or permission to walk underwater.
const isWater=v=>!!v&&(v.name==='water'||AQUATIC.has(v.name)&&v.boundingBox==='empty');
const open=v=>!!v&&(v.boundingBox==='empty'||v.name.endsWith('_door')&&v.getProperties?.().open===true)&&!HAZARDS.has(v.name);
function safeCurrent(bot,v){
 const level=Number(v.getProperties?.().level||0);
 if(level===0)return true;
 // Shallow runoff over a full floor is wadeable. Falling water and currents
 // over deep water remain excluded: they can pull a swimmer off the route.
 if(level>=8||!v.position)return false;
 const floor=bot.blockAt(v.position.offset(0,-1,0));
 return !!floor&&floor.boundingBox==='block'&&!HAZARDS.has(floor.name)&&
  (!floor.shapes||floor.shapes.some(s=>s[0]===0&&s[2]===0&&s[3]===1&&s[5]===1&&s[4]===1));
}
function cell(bot,x,y,z){
 const at=(dx,dy,dz)=>bot.blockAt(new Vec3(x+dx,y+dy,z+dz)),feet=at(0,0,0),head=at(0,1,0),floor=at(0,-1,0);
 if(!feet||!floor||!open(head)||isWater(head))return null;
 const wet=isWater(feet);
 if(wet){if(!safeCurrent(bot,feet))return null;if(!bot.entity?.isInWater&&(bot.labOxygen??20)<6)return null;}
 else if(!open(feet)||floor.boundingBox!=='block'||HAZARDS.has(floor.name))return null;
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++){
  const v=at(dx,dy,dz);if(!v||HAZARDS.has(v.name)||v.getProperties?.().waterlogged&&!AQUATIC.has(v.name)||isWater(v)&&!safeCurrent(bot,v))return null;
 }
 return {wet,mode:wet?(floor.boundingBox==='block'?'wade':'swim'):'bank',cost:wet?(floor.boundingBox==='block'?3:5):1};
}
function validRoute(bot,path,goal){
 const x=Math.floor(goal[0]),y=Math.round(goal[1]),z=Math.floor(goal[2]),landing=cell(bot,x,y,z);
 if(!landing||landing.wet)return false;
 // A supported bank may fail the stricter dry work-footing check solely for
 // adjacent water. An empty path is valid only when already on that landing.
 if(!path.length){const p=bot.entity.position;return bot.entity.onGround===true&&Math.floor(p.x)===x&&Math.floor(p.z)===z&&Math.abs(p.y-y)<.4;}
 let wet=0;
 for(const q of path){const c=cell(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2]));if(!c)return false;wet=c.wet?wet+1:0;if(wet>24)return false;}
 return true;
}
// A water-capable route can contain long dry stretches. Only its local wet
// segment needs swimming controls and buoyancy-height waypoint tolerances.
function swimmingSegment(bot,goal){
 const p=bot.entity.position;
 if(bot.entity.isInWater||isWater(bot.blockAt(p.floored())))return true;
 return !!goal&&cell(bot,Math.floor(goal[0]),Math.round(goal[1]),Math.floor(goal[2]))?.wet===true;
}
function drive(bot,goal,permissions){
 const p=bot.entity.position,q=new Vec3(Math.floor(goal[0]),Math.round(goal[1]),Math.floor(goal[2])),target=cell(bot,q.x,q.y,q.z),d=Math.hypot(goal[0]-p.x,goal[2]-p.z);
 // Recheck the next short segment at physics rate, including body/player space.
 let safe=!!target&&d<=2.2&&space.clearOfPlayers(bot,new Vec3(...goal));
 for(let i=1;i<=4&&safe;i++){
  const x=Math.floor(p.x+(goal[0]-p.x)*i/4),z=Math.floor(p.z+(goal[2]-p.z)*i/4);
  safe=[Math.round(p.y),Math.round(p.y)-1,Math.round(goal[1]),Math.round(goal[1])-1].some(y=>cell(bot,x,y,z));
 }
 const desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),angle=Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw));
 for(const k of ['back','left','right','sneak','sprint'])bot.setControlState(k,false);
 bot.setControlState('forward',!!permissions.move&&safe&&d>.15&&Math.abs(angle)<.4);
 bot.setControlState('jump',!!permissions.jump&&(!!bot.entity.isInWater||safe&&goal[1]-p.y>.4));
 if(permissions.turn&&Math.abs(angle)>.002)Promise.resolve(bot.look(bot.entity.yaw+Math.max(-.18,Math.min(.18,angle)),0,true)).catch(()=>{});
 return safe;
}
module.exports={cell,validRoute,drive,isWater,swimmingSegment};

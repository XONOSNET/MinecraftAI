// Plan local body access through soft cover. Virtual routes are never walked.
const {Vec3}=require('vec3'),{route,standable}=require('./field_navigation'),access=require('./resource_access'),{withinReach}=require('./resource_target'),{visibleBlock}=require('./target_scan');
const space=require('./resource_space');
const LIMIT=8;
function terrain(bot,goal,options){
 const low=Math.min(Math.floor(bot.entity.position.y),Math.round(goal[1])),soil=Math.max(Math.floor(bot.entity.position.y),Math.round(goal[1])),cache=new Map();
 const view=Object.create(bot);
 view.blockAt=p=>{
  const id=p.toString();if(cache.has(id))return cache.get(id);
  const b=bot.blockAt(p),soft=b&&p.y>=low&&(b.name.endsWith('_leaves')||p.y>=soil)&&access.safeClear(bot,b,options)&&!space.busy(bot,options.run,p);
  const value=soft?{...b,name:'air',boundingBox:'empty',shapes:[]}:b;cache.set(id,value);return value;
 };return view;
}
function stance(bot,goal,options={}){return standable(terrain(bot,goal,options),Math.floor(goal[0]),Math.round(goal[1]),Math.floor(goal[2]));}
function surface(bot,x,z,options={}){
 for(let y=Math.floor(bot.entity.position.y)+3;y>=Math.floor(bot.entity.position.y)-2;y--){
  const cover=[0,1].some(dy=>{const b=bot.blockAt(new Vec3(x,y+dy,z));return b?.boundingBox==='block'&&access.clearable(b);});
  if(cover&&stance(bot,[x+.5,y+.1,z+.5],options))return y;
 }
 return null;
}
function plan(bot,goal,options={}){
 const p=bot.entity.position;if(Math.hypot(goal[0]-p.x,goal[2]-p.z)>8||Math.abs(goal[1]-p.y)>3)return null;
 const view=terrain(bot,goal,options),path=route(view,goal,10,384,true,{bounds:options.bounds,reversible:true});if(!path.reached)return null;
 const blocks=new Map();let approach=[p.x,p.y,p.z],blocked=false;
 for(const q of path.path){
  const cells=[new Vec3(Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2]))];
  for(const cell of cells)for(let dy=0;dy<=2;dy++){
   // The extra head cell is required only for a real ascending departure.
   if(dy===2&&!path.path.some(next=>Math.abs(next[0]-q[0])+Math.abs(next[2]-q[2])<=1.01&&next[1]>q[1]+.6))continue;
   const at=cell.offset(0,dy,0),b=bot.blockAt(at);
   if(b&&view.blockAt(at)?.name==='air'&&b.boundingBox!=='empty'){blocks.set(at.toString(),b);blocked=true;}
  }
  if(!blocked&&standable(bot,Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])))approach=q;
 }
 if(blocks.size>LIMIT)return null;
 return {goal,blocks:[...blocks.values()],approach};
}
async function clear(bot,motor,block,options={}){
 const state=options.state||{},key=options.key||'body';
 if(state.bodyKey!==key){state.bodyKey=key;state.bodyCleared=0;}
 if((state.bodyCleared||0)>=LIMIT||!access.safeClear(bot,block,options)||space.busy(bot,options.run,block.position)||!withinReach(bot,block.position)||!visibleBlock(bot,block))return false;
 motor.pause();motor.lockLook(true);
 try{if(await access.dig(bot,block,{validate:b=>access.safeClear(bot,b,options)&&!space.busy(bot,options.run,b.position)})){state.bodyCleared=(state.bodyCleared||0)+1;return true;}return false;}finally{motor.lockLook(false);}
}
function dropCover(bot,drop){
 const below=bot.blockAt(drop.position.floored().offset(0,-1,0));if(!below?.name.endsWith('_leaves'))return null;
 const eye=bot.entity.position.offset(0,bot.entity.eyeHeight||1.62,0),delta=below.position.offset(.5,.5,.5).minus(eye),length=delta.norm();
 return length&&length<=4.2?bot.world.raycast(eye,delta.scaled(1/length),length+.05):null;
}
module.exports={LIMIT,stance,surface,plan,clear,dropCover};

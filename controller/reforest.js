// Optional work between outdoor actions. Never route, clear land or create items.
const {Vec3}=require('vec3'),inventory=require('./inventory_sync'),house=require('./house'),space=require('./resource_space');
const SOIL=new Set(['grass_block','dirt','coarse_dirt','podzol','rooted_dirt','moss_block']);
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','creeper','spider','cave_spider','witch','pillager','vindicator','enderman']);
const PHASES=new Set(['gather','fuel_log','survival_wood','stone_return','return_home','night_fuel','night_scout','night_food_home','night_wool_home','leave_hut']);
const CHECK_INTERVAL_MS=5000,PLANT_COOLDOWN_MS=12000,PLANT_JITTER_MS=8000;
const HOME_BUFFER=9;
const sapling=name=>name.endsWith('_sapling')||['mangrove_propagule','azalea','flowering_azalea'].includes(name);
const groupSize=name=>['dark_oak_sapling','pale_oak_sapling'].includes(name)?4:1;
const empty=block=>block&&['air','cave_air'].includes(block.name);
function plots(t){return [...new Map([t.plot,...(t.campPlots||[])].filter(Boolean).map(p=>[`${p.x},${p.z}`,p])).values()];}
function idle(t,b,state,opportunity=false){
 const p=b.entity?.position,v=b.entity?.velocity;
 return !!p&&!!t.plot&&plots(t).length>=(state.world.count||1)&&PHASES.has(t.phase)&&!t.error&&!t.homeRepair&&(opportunity||!t.navigationActive)&&!t.harvestTarget&&!t.resourceAccess?.column?.length&&
  b.health>=18&&b.food>=16&&!b.isSleeping&&!b.currentWindow&&!b.targetDigBlock&&!b.usingHeldItem&&b.entity.onGround===true&&!b.entity.isInWater&&!b.entity.isInLava&&
  (opportunity||Math.hypot(v?.x||0,v?.z||0)<.015)&&Math.abs(v?.y||0)<.1&&
  (opportunity||!['forward','back','left','right','jump','sneak'].some(key=>b.getControlState?.(key)))&&
  !Object.values(b.entities||{}).some(e=>HOSTILES.has(e.name)&&e.isValid!==false&&e.position.distanceTo(p)<12);
}
function safe(t,b,state,positions,name){
 const bounds=state.world.bounds,eye=b.entity.position.offset(0,b.entity.eyeHeight||1.62,0),yards=plots(t),margin=house.config.radius+HOME_BUFFER;
 for(const p of positions){
  if(p.x<bounds[0]+4||p.x>=bounds[1]-4||p.z<bounds[2]+4||p.z>=bounds[3]-4)return false;
  if(yards.some(plot=>Math.abs(p.x-plot.x)<=margin&&Math.abs(p.z-plot.z)<=margin))return false;
  if(Math.hypot(p.x+.5-b.entity.position.x,p.z+.5-b.entity.position.z)<1.2||eye.distanceTo(p.offset(.5,0,.5))>4.1)return false;
  if(space.busy(b,state.run,p))return false;
  if((t.navigator?.path||[]).some(q=>Math.hypot(q[0]-p.x-.5,q[2]-p.z-.5)<1.5))return false;
  const ground=b.blockAt(p.offset(0,-1,0)),target=b.blockAt(p);
  if(!empty(target)&&target?.name!==name||!ground||!SOIL.has(ground.name)&&!(name==='mangrove_propagule'&&ground.name==='mud'))return false;
  // Some freshly loaded empty chunk sections report zero cached skylight even
  // in the open. An unobstructed sky column is also a valid daylight site.
  if(Number.isFinite(target.skyLight)&&Number.isFinite(target.light)&&Math.max(target.skyLight,target.light)<9&&
   b.world.raycast(p.offset(.5,1,.5),new Vec3(0,1,0),(b.game?.minY??-64)+(b.game?.height||384)-p.y-1))return false;
  // Leave actual room for a tree. No building/leaf destruction to make a spot.
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=1;dy<=6;dy++){
   const block=b.blockAt(p.offset(dx,dy,dz));if(!empty(block))return false;
  }
  // Avoid crowding existing trunks/saplings, including ones just planted by peers.
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(let dy=-1;dy<=1;dy++){
   const q=p.offset(dx,dy,dz),block=b.blockAt(q),sameGroup=block?.name===name&&positions.some(v=>v.equals(q));
   if(!block||!sameGroup&&(sapling(block.name)||block.name.endsWith('_log')))return false;
  }
  if(target.name===name)continue;
  const delta=p.offset(.5,0,.5).minus(eye),distance=delta.norm();
  const hit=b.world.raycast(eye,delta.scaled(1/distance),distance+.1);
  if(!hit?.position.equals(ground.position))return false;
 }
 return true;
}
function choose(t,b,state,random=Math.random){
 const items=b.inventory.items().filter(i=>sapling(i.name));
 const pending=t.reforest?.pending;
 if(pending){
  const group=pending.positions.map(p=>new Vec3(...p)),positions=group.filter(p=>b.blockAt(p)?.name!==pending.name);
  if(positions.length&&items.filter(i=>i.name===pending.name).reduce((sum,i)=>sum+i.count,0)>=positions.length&&safe(t,b,state,group,pending.name))return {name:pending.name,positions,group};
 }
 const names=[...new Set(items.map(i=>i.name))].filter(name=>items.filter(i=>i.name===name).reduce((sum,i)=>sum+i.count,0)>=groupSize(name));
 if(!names.length)return null;
 const center=b.entity.position.floored();
 for(const dy of [0,-1,1]){
  const options=[];
  for(const name of names)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)options.push({name,dx,dz});
  // Draw without replacement so we can stop scanning after the first safe spot.
  while(options.length){
   const i=Math.min(options.length-1,Math.floor(random()*options.length)),{name,dx,dz}=options[i];
   options[i]=options.at(-1);options.pop();
   const p=center.offset(dx,dy,dz),positions=groupSize(name)===4?[p,p.offset(1,0,0),p.offset(0,0,1),p.offset(1,0,1)]:[p];
   if(positions.every(p=>empty(b.blockAt(p)))&&safe(t,b,state,positions,name))return {name,positions,group:positions};
  }
 }
 return null;
}
async function place(b,p,name){
 // Register before sending, and bound an optional placement wait to 800 ms.
 let timer,listener;
 const verified=new Promise(resolve=>{
  listener=(_old,next)=>{if(next?.position?.equals(p)&&next.name===name)resolve(true);};
  b.on('blockUpdate',listener);timer=setTimeout(()=>resolve(b.blockAt(p)?.name===name),800);
 });
 try{await b._genericPlace(b.blockAt(p.offset(0,-1,0)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});return await verified;}
 finally{clearTimeout(timer);b.removeListener('blockUpdate',listener);}
}
async function tick(t,b,motor,state,{now=Date.now(),random=Math.random,opportunity=false}={}){
 const r=t.reforest??={planted:0,attempts:0,nextCheck:0};
 if(now<r.nextCheck)return false;
 r.nextCheck=now+CHECK_INTERVAL_MS;
 if(!idle(t,b,state,opportunity))return false;
 // Optional planting must not keep an otherwise stalled gatherer busy forever.
 if(!r.pending&&r.lastPrimaryProgress===t.lastProgress)return false;
 const choice=choose(t,b,state,random);if(!choice)return false;
 if(opportunity){motor.pause();if(b.waitForTicks)await b.waitForTicks(2);}
 // Random intervals plus random nearby locations avoid synchronized rows/forests.
 r.nextCheck=now+PLANT_COOLDOWN_MS+Math.floor(random()*PLANT_JITTER_MS);r.attempts++;r.lastPrimaryProgress=t.lastProgress;
 const previous=b.heldItem?.name;let planted=0;
 motor.lockLook(true);
 try{
  await inventory.equip(b,choice.name);
  // Recheck the whole spot after equipping; another player may have approached.
  if(!idle(t,b,state,opportunity)||!safe(t,b,state,choice.group,choice.name))return false;
  if(choice.group.length===4)r.pending={name:choice.name,positions:choice.group.map(p=>p.toArray())};
  for(const p of choice.positions){
   if(!idle(t,b,state,opportunity)||!empty(b.blockAt(p))||space.busy(b,state.run,p))break;
   if(!await place(b,p,choice.name))break;
   planted++;r.planted++;r.last={item:choice.name,position:p.toArray(),at:Date.now()};
  }
  if(choice.group.every(p=>b.blockAt(p)?.name===choice.name))r.pending=null;
 }catch(error){r.last_error=String(error.message).slice(0,160);}
 finally{
  try{if(previous&&b.inventory.items().some(i=>i.name===previous))await inventory.equip(b,previous);}catch(error){r.last_error=String(error.message).slice(0,160);}
  motor.lockLook(false);
 }
 if(planted){t.message='Replanted '+planted+' '+choice.name.replaceAll('_',' ')+' outside the house plots';t.lastReport=0;return true;}
 return false;
}
module.exports={sapling,groupSize,idle,safe,choose,tick};

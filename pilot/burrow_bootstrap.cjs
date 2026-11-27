'use strict';

// The continuing resident may prepare its first basic tools while safely waiting
// in cover. This is real, verified crafting; no lesson milestone is granted.
const {Vec3}=require('vec3');
const burrow=require('../controller/emergency_burrow');
const workspace=require('../controller/burrow_workspace');
const inventory=require('../controller/inventory_sync');
const access=require('../controller/resource_access');
const space=require('../controller/resource_space');
const {visibleBlock}=require('../controller/target_scan');
const BUDGET_MS=60000,MAX_ACTIONS=8,RETRY_MS=60000;
const count=(b,name)=>b.inventory.items().filter(i=>typeof name==='function'?name(i.name):i.name===name).reduce((n,i)=>n+i.count,0);
const hasTool=(b,kind)=>b.inventory.items().some(i=>
 new RegExp('^(wooden|stone|iron|golden|diamond|netherite)_'+kind+'$').test(i.name)&&
 (i.maxDurability==null||i.maxDurability-(i.durabilityUsed||0)>3));
const nextTool=b=>!hasTool(b,'axe')?'wooden_axe':!hasTool(b,'pickaxe')?'wooden_pickaxe':null;

function ready(t,b,s){
 if(!s||s!==t.wilderness?.burrow||s.stage!=='hidden'||!s.waitReason||t.phase!=='night_burrow'||
    b.health<=0||b.isSleeping||b.entity?.onGround!==true||typeof b.recipesFor!=='function'||typeof t.craft!=='function')return false;
 if(!Array.isArray(s.feet)||s.feet.length!==3||!s.feet.every(Number.isFinite))return false;
 const feet=new Vec3(...s.feet),p=b.entity.position;
 return Math.abs(p.y-(feet.y-2))<.2&&Math.hypot(p.x-feet.x-.5,p.z-feet.z-.5)<.35&&
  burrow.sealed(b,s)&&burrow.walls(b,feet,s);
}

function room(t,b,s){
 const feet=new Vec3(...s.feet),old=s.workspace;
 if(old){
  if(old.stair||!Array.isArray(old.floor)||old.floor.length!==3||!old.floor.every(Number.isFinite)||
     !workspace.safe(b,feet,old))return null;
  const at=new Vec3(...old.floor),block=b.blockAt(at);
  if(!block||!['air','crafting_table',...burrow.EARTH].includes(block.name))return null;
  return old;
 }
 for(const [x,z]of[[1,0],[0,1],[-1,0],[0,-1]]){
  const at=feet.offset(x,-2,z),block=b.blockAt(at);
  if(!block||!burrow.EARTH.has(block.name)||!burrow.safeNotch(b,feet,at)||
     !space.clearOfPlayers(b,at.offset(.5,.5,.5),1))continue;
  return {floor:at.toArray(),stationOnly:true,attempts:0,pilotOwned:true};
 }
 return null;
}

async function tick(t,b,motor,{checkpoint=()=>{},now=Date.now()}={}){
 const s=t.wilderness?.burrow;
 if(!ready(t,b,s)||!nextTool(b))return false;
 const r=s.pilotBootstrap??={startedAt:now,actions:0,retryAt:0,outputs:[]};
 if(now<(r.retryAt||0))return false;
 if(r.retryAt){r.startedAt=now;r.actions=0;r.retryAt=0;}
 if(now-r.startedAt>=BUDGET_MS||r.actions>=MAX_ACTIONS){r.retryAt=now+RETRY_MS;checkpoint();return false;}
 const valid=()=>ready(t,b,s);
 const mark=(message)=>{r.actions++;r.lastAt=now;t.message=message;checkpoint();motor.pause();};
 const finished=async(name,before)=>{
  await inventory.sync(b);
  if(!valid())throw Error('Protected bootstrap shelter or life changed');
  if(count(b,name)<=before)throw Error('Protected bootstrap output was not confirmed: '+name);
  r.outputs=[...new Set([...(r.outputs||[]),name])];t.lastProgress=Date.now();checkpoint();
 };
 const craft=async(name,table=null)=>{
  const before=count(b,name);mark('Protected bootstrap: crafting '+name.replaceAll('_',' '));
  await t.craft(b,name,1,table);await finished(name,before);return true;
 };
 try{
  await inventory.sync(b);
  if(!valid())return false;
  const target=nextTool(b);if(!target)return false;
  const candidate=room(t,b,s);
  if(!candidate)return false;
  const at=new Vec3(...candidate.floor),block=b.blockAt(at);
  const table=block.name==='crafting_table'?block:null;
  const carriedTable=count(b,'crafting_table');
  const planks=count(b,n=>n.endsWith('_planks'));
  const needed=(table||carriedTable?0:4)+3+(count(b,'stick')>=2?0:2);
  if(planks<needed){
   const log=b.inventory.items().find(i=>/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/.test(i.name));
   if(log)return await craft(log.name.replace('_log','_planks'));
   return false;
  }
  if(!table&&!carriedTable)return await craft('crafting_table');
  // Publish the narrow excavation/placement intent before altering its cell.
  // On reconnect the shared dry-shell checks revalidate this same owned pocket.
  if(!s.workspace){s.workspace=candidate;checkpoint();}
  const clear=()=>valid()&&workspace.safe(b,new Vec3(...s.feet),s.workspace)&&
   space.clearOfPlayers(b,at.offset(.5,.5,.5),1);
  if(!clear())return false;
  if(!table&&block.name!=='air'){
   if(!burrow.EARTH.has(block.name)||!b.canDigBlock(block))return false;
   const aimPoint=at.offset(.5,.18,.5);
   if(!visibleBlock(b,block,aimPoint))return false;
   mark('Protected bootstrap: opening a capped workbench pocket');
   if(!await access.dig(b,block,{aimPoint,validate:clear}))throw Error('Protected workbench pocket excavation was not confirmed');
   if(!clear()||b.blockAt(at)?.name!=='air')throw Error('Protected workbench pocket changed');
   t.lastProgress=Date.now();checkpoint();return true;
  }
  if(!table){
   const support=b.blockAt(at.offset(0,-1,0));
   if(support?.boundingBox!=='block'||support.getProperties?.().waterlogged)return false;
   // This is placement intent, not proof. Persist it first so a confirmed
   // table arriving just before disconnect remains a recognized dry-shell cell.
   // Every use below still checks the actual native block.
   s.workspace.station='crafting_table';
   mark('Protected bootstrap: placing a real workbench in the sealed pocket');
   await inventory.equip(b,'crafting_table');
   if(!clear()||b.blockAt(at)?.name!=='air')throw Error('Protected workbench placement lost its safe cell');
   try{await b.placeBlock(support,new Vec3(0,1,0));}catch(error){if(b.blockAt(at)?.name!=='crafting_table')throw error;}
   if(!clear()||b.blockAt(at)?.name!=='crafting_table')throw Error('Protected workbench placement was not confirmed');
   s.workspace.station='crafting_table';s.workspace.attempts=0;t.lastProgress=Date.now();checkpoint();return true;
  }
  // A recorded placement may have completed immediately before disconnection.
  if(s.workspace.station!=='crafting_table'){s.workspace.station='crafting_table';checkpoint();}
  if(count(b,'stick')<2)return await craft('stick');
  return await craft(target,table);
 }catch(error){
  if(error.code==='PILOT_LIFE_CHANGED')throw error;
  r.lastFailure=String(error.message||error);r.retryAt=now+RETRY_MS;
  t.message='Protected bootstrap deferred: '+r.lastFailure;checkpoint();return true;
 }
}

module.exports={tick,ready,room,BUDGET_MS,MAX_ACTIONS,RETRY_MS};

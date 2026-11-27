'use strict';

// A continuing resident can earn its first harvesting tool where it actually
// stands. No route, remote workbench, item grant or excavation is used here.
const {Vec3}=require('vec3');
const inventory=require('../controller/inventory_sync');
const shelter=require('../controller/shelter_policy');
const navigation=require('../controller/field_navigation');
const water=require('../controller/water_navigation');
const space=require('../controller/resource_space');
const placement=require('../controller/placement_reference');
const {visibleBlock}=require('../controller/target_scan');
const {privatePlotCell}=require('../controller/world_navigation');
const house=require('../controller/house');
const BUDGET_MS=60000,MAX_ACTIONS=8,RETRY_MS=60000;
const count=(b,match)=>b.inventory.items().filter(i=>typeof match==='function'?match(i.name):i.name===match).reduce((n,i)=>n+i.count,0);
const hasAxe=b=>b.inventory.items().some(i=>/^(wooden|stone|iron|golden|diamond|netherite)_axe$/.test(i.name)&&
 (i.maxDurability==null||i.maxDurability-(i.durabilityUsed||0)>3));
const empty=block=>!!block&&['air','cave_air'].includes(block.name)&&block.boundingBox==='empty'&&!block.getProperties?.().waterlogged;
const within=(q,bounds)=>Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&
 q.x>bounds[0]+2&&q.x<bounds[1]-3&&q.z>bounds[2]+2&&q.z<bounds[3]-3;

function ready(t,b,state){
 const p=b.entity?.position,time=b.time?.timeOfDay,n=t.wilderness;
 if(!n||!p||!['gather','night_bootstrap'].includes(t.phase)||b.health<=0||b.isSleeping||b.entity.onGround!==true||
    b.entity.isInWater||b.entity.isInLava||!Number.isFinite(time)||time<0||time>=12000||
    n.burrow||n.mine&&!['done','approach'].includes(n.mine.stage)||t.airEscape||t.waterWork||t.waterTravel||
    typeof t.craft!=='function'||typeof t.place!=='function'||typeof b.recipesFor!=='function'||
    typeof b.world?.raycast!=='function'||!within(p,state.world?.bounds))return false;
 const at=p.floored();
 if(!navigation.standable(b,at.x,Math.round(p.y),at.z)||water.cell(b,at.x,Math.round(p.y),at.z)?.wet!==false)return false;
 return !shelter.threats(b).length&&shelter.assess(b,state.world,t).mode==='work';
}

function allowed(t,b,q,state){
 if(!within(q,state.world?.bounds))return false;
 const foreign=(t.campPlots||[]).filter(h=>h&&(h.x!==t.plot?.x||h.y!==t.plot?.y||h.z!==t.plot?.z));
 if(foreign.some(h=>privatePlotCell(q.toArray(),h)))return false;
 // A temporary bench must not obstruct the owned home's future floor, walls,
 // doorway or room. Its actual planned workbench cell is the sole exception.
 if(t.plot&&Math.abs(q.x-t.plot.x)<=4&&Math.abs(q.z-t.plot.z)<=4&&q.y>=t.plot.y-1&&q.y<=t.plot.y+4&&
    !q.equals(house.point(t.plot,'table')))return false;
 const center=q.offset(.5,.5,.5);
 return space.clearOfPlayers(b,center)&&!space.busy(b,state.run,center);
}

function usableTable(t,b,q,state){
 if(!allowed(t,b,q,state))return false;
 const block=b.blockAt(q),eye=b.entity.position.offset(0,b.entity.eyeHeight||1.62,0);
 return block?.name==='crafting_table'&&!block.getProperties?.().waterlogged&&
  eye.distanceTo(q.offset(.5,.5,.5))<=4.2&&visibleBlock(b,block);
}

function placementCell(t,b,q,state){
 if(!allowed(t,b,q,state)||!empty(b.blockAt(q)))return false;
 const p=b.entity.position;
 if(q.x<p.x+.31&&q.x+1>p.x-.31&&q.z<p.z+.31&&q.z+1>p.z-.31&&q.y<p.y+1.8&&q.y+1>p.y)return false;
 const support=b.blockAt(q.offset(0,-1,0));
 if(!support||support.boundingBox!=='block'||support.getProperties?.().waterlogged||
    /^(sand|red_sand|gravel|water|lava|magma_block|campfire|soul_campfire|fire|soul_fire|cactus|powder_snow)$/.test(support.name))return false;
 for(const d of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
  const v=b.blockAt(q.offset(...d));
  if(!v||v.getProperties?.().waterlogged||water.isWater(v)||/^(lava|fire|soul_fire|bubble_column|powder_snow|sand|red_sand|gravel)$/.test(v.name))return false;
 }
 return placement.references(b,q,{visibleOnly:true}).some(ref=>ref.face.y===1&&ref.block.position.equals(support.position));
}

function choose(t,b,state,record){
 const saved=record?.position;
 if(Array.isArray(saved)&&saved.length===3&&saved.every(Number.isFinite)){
  const q=new Vec3(...saved);
  if(usableTable(t,b,q,state)||placementCell(t,b,q,state))return q;
 }
 const p=b.entity.position.floored(),candidates=[];
 for(const dy of [0,-1,1])for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
  const q=p.offset(x,dy,z);if(usableTable(t,b,q,state))candidates.push(q);
 }
 if(candidates.length)return candidates.sort((a,c)=>a.distanceTo(b.entity.position)-c.distanceTo(b.entity.position))[0];
 const cells=[];
 for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
  const q=p.offset(x,0,z);if(placementCell(t,b,q,state))cells.push(q);
 }
 return cells.sort((a,c)=>a.distanceTo(b.entity.position)-c.distanceTo(b.entity.position))[0]||null;
}

async function tick(t,b,motor,state,{now=Date.now(),checkpoint=()=>{}}={}){
 if(hasAxe(b)||!ready(t,b,state))return false;
 const n=t.wilderness;
 let r=n.pilotWorkbench;
 if(!r||r.owner!==b.username||r.run!==state.run)r=n.pilotWorkbench={owner:b.username,run:state.run,position:null,
  startedAt:now,actions:0,retryAt:0,outputs:[]};
 if(now<(r.retryAt||0))return false;
 if(r.retryAt){r.startedAt=now;r.actions=0;r.retryAt=0;}
 if(now-r.startedAt>=BUDGET_MS||r.actions>=MAX_ACTIONS){r.retryAt=now+RETRY_MS;checkpoint();return false;}
 if(Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){
  motor.pause();t.message='Settling at the local workbench before making the harvesting axe';return true;
 }
 const valid=()=>ready(t,b,state);
 const mark=message=>{r.actions++;r.lastAt=now;t.message=message;checkpoint();motor.pause();};
 const verify=async(name,before)=>{
  await inventory.sync(b);
  if(!valid())throw Error('Local bootstrap footing, threat or life changed');
  if(count(b,name)<=before)throw Error('Local bootstrap output was not confirmed: '+name);
  r.outputs=[...new Set([...(r.outputs||[]),name])];t.lastProgress=Date.now();checkpoint();
 };
 const craft=async(name,table=null)=>{
  const before=count(b,name);mark('Local preparation: crafting '+name.replaceAll('_',' '));
  await t.craft(b,name,1,table);await verify(name,before);return true;
 };
 try{
  await inventory.sync(b);if(!valid()||hasAxe(b))return false;
  const q=choose(t,b,state,r);
  if(!q){r.lastFailure='No visible, supported local workbench cell; continuing useful gathering';r.retryAt=now+RETRY_MS;checkpoint();return false;}
  const table=usableTable(t,b,q,state)?b.blockAt(q):null;
  const needed=(table||count(b,'crafting_table')?0:4)+3+(count(b,'stick')>=2?0:2);
  if(count(b,name=>name.endsWith('_planks'))<needed){
   const log=b.inventory.items().find(i=>/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/.test(i.name));
   if(!log)return false;
   return await craft(log.name.replace('_log','_planks'));
  }
  if(!table&&!count(b,'crafting_table'))return await craft('crafting_table');
  if(!table){
   if(!valid()||!placementCell(t,b,q,state))return false;
   r.position=q.toArray();r.placed=false;checkpoint();
   const before=count(b,'crafting_table');mark('Local preparation: placing a real nearby workbench');
   await t.place(b,q,'crafting_table',()=>valid()&&placementCell(t,b,q,state));
   await inventory.sync(b);
   if(!valid()||!usableTable(t,b,q,state)||count(b,'crafting_table')>=before)throw Error('Local workbench placement was not confirmed');
   r.placed=true;t.lastProgress=Date.now();checkpoint();return true;
  }
  if(!r.position||!q.equals(new Vec3(...r.position))){r.position=q.toArray();r.placed=false;checkpoint();}
  if(count(b,'stick')<2)return await craft('stick');
  const result=await craft('wooden_axe',table);
  if(!hasAxe(b))throw Error('Local harvesting axe is not usable');
  n.bootstrap=true;r.completedAt=now;if(t.phase==='night_bootstrap')t.phase='gather';checkpoint();return result;
 }catch(error){
  if(error.code==='PILOT_LIFE_CHANGED')throw error;
  r.lastFailure=String(error.message||error);r.retryAt=now+RETRY_MS;
  t.message='Local preparation deferred: '+r.lastFailure;checkpoint();return true;
 }
}

function report(t){const r=t.wilderness?.pilotWorkbench;return r?{position:r.position,actions:r.actions,retryAt:r.retryAt,
 outputs:r.outputs||[],lastFailure:r.lastFailure||null,completedAt:r.completedAt||null}:null;}
module.exports={tick,ready,choose,placementCell,usableTable,hasAxe,report,BUDGET_MS,MAX_ACTIONS,RETRY_MS};

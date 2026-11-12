// Optional work uses real stock and the same crafting, furnace and equip paths as lessons.
const rules=require('../config/survival-progression.json'),furnace=require('./furnace');
const {Vec3}=require('vec3'),house=require('./house');
const ARMOR=[['iron_chestplate',8,'torso',6],['iron_leggings',7,'legs',7],['iron_helmet',5,'head',5],['iron_boots',4,'feet',8]];
const UPGRADES=[['shield',1,'off-hand',45],['iron_sword',2],...ARMOR,['iron_pickaxe',3],['iron_axe',3]];
const count=(b,name)=>b.inventory.items().filter(i=>i.name===name).reduce((sum,i)=>sum+i.count,0);
const fuel=name=>name==='charcoal'||name==='coal'||name.endsWith('_planks')||name==='stick';
const rock=name=>/^(stone|wooden|iron|diamond|netherite)_pickaxe$/.test(name);
const have=(b,name,slot)=>count(b,name)>0||b.inventory.slots?.[slot]?.name===name;
const durable=(b,item)=>item?(item.maxDurability??b.registry?.itemsByName?.[item.name]?.maxDurability??Infinity)-(item.durabilityUsed??0):0;
const usable=(b,name,slot,minimum=1)=>[...b.inventory.items(),b.inventory.slots?.[slot]].some(item=>item?.name===name&&durable(b,item)>=minimum);
function recipes(b,name,table){
 const id=b.registry?.itemsByName?.[name]?.id;
 return id!=null&&(b.recipesFor?.(id,null,1,table).length>0||name==='shield'&&table&&b.inventory.slots?.length&&
  !!require('./crafting').mixedWoodRecipe(b,b.inventory,name));
}
function choose(b,{table,hearth,prepare},work={}){
 const items=b.inventory.items(),hasFuel=items.some(i=>fuel(i.name)),log=items.find(i=>i.name.endsWith('_log'));
 const can=(name,station)=>recipes(b,name,station)&&!(work.failed?.[name]>Date.now());
 for(const [name,,slot,index] of UPGRADES){
  if(slot&&b.inventory.items().some(i=>i.name===name&&durable(b,i)>durable(b,b.inventory.slots?.[index]))&&
    !(work.failed?.[name]>Date.now()))return {kind:'equip',name,slot,index};
 }
 if(table&&can('stone_pickaxe',table)&&(!items.some(i=>rock(i.name)&&i.name!=='wooden_pickaxe')||
    !items.some(i=>rock(i.name)&&i.name!=='wooden_pickaxe'&&durable(b,i)>16)))return {kind:'craft',name:'stone_pickaxe',station:table};
 if(count(b,'torch')<8&&can('torch',null))return {kind:'craft',name:'torch',station:null};
 if(hearth&&hasFuel&&log&&count(b,'torch')<8&&count(b,'coal')+count(b,'charcoal')<2&&!(work.failed?.charcoal>Date.now()))
  return {kind:'smelt',name:'charcoal',input:log.name,station:hearth};
 if(table)for(const [name,cost,,index] of UPGRADES){
  const missing=name==='shield'?!usable(b,name,index,rules.combat.min_shield_durability):!have(b,name,index);
  if(missing&&count(b,'iron_ingot')>=cost&&can(name,table))return {kind:'craft',name,station:table};
 }
 if(hearth&&hasFuel&&count(b,'raw_iron')&&!(work.failed?.iron_ingot>Date.now()))return {kind:'smelt',name:'iron_ingot',input:'raw_iron',station:hearth};
 if(prepare&&!have(b,prepare)&&can(prepare,prepare==='crafting_table'?null:table))return {kind:'craft',name:prepare,station:prepare==='crafting_table'?null:table};
 if((count(b,'raw_iron')||log)&&!hasFuel&&log&&can(log.name.replace('_log','_planks'),null)&&
    (count(b,'raw_iron')||count(b,log.name)>1))return {kind:'craft',name:log.name.replace('_log','_planks'),station:null};
 if((table||count(b,'coal')+count(b,'charcoal')>0)&&count(b,'stick')<2&&can('stick',null))return {kind:'craft',name:'stick',station:null};
 return null;
}
async function tick(t,b,motor,stations={}){
 if(!rules.enabled||b.isSleeping||b.entity.onGround!==true||b.health<=0)return false;
 const n=t.wilderness,work=n.shelterWork??={failed:{},completed:0,failures:0};
 const job=choose(b,stations,work);
 if(!job)return false;
 const {kind,name,station,slot,index,input}=job,before=count(b,name);
 motor.pause();work.last=name;t.message='Protected work: '+kind+' '+name.replaceAll('_',' ');
 try{
  if(kind==='equip'){
   const carried=b.inventory.items().filter(i=>i.name===name).sort((a,c)=>durable(b,c)-durable(b,a))[0];
   await b.equip(carried,slot);
   if(b.inventory.slots?.[index]?.name!==name)throw Error('Equipment change was not confirmed');
  }else if(kind==='smelt'){
   await furnace.smelt(b,station,input,name,fuel,{amount:1});
  }else await t.craft(b,name,1,station);
  if(kind!=='equip'&&count(b,name)<=before)throw Error('Work output was not confirmed');
  work.completed++;t.lastProgress=Date.now();
 }catch(error){
  work.failed[name]=Date.now()+30000;work.failures++;work.reason=error.message;
  t.message='Protected work deferred: '+error.message;
 }
 return true;
}
async function atHome(t,b,motor){
 if(!rules.enabled||!t.plot||t.homeDamage?.unsafe||!t.milestones.includes('hut')||!require('./world_navigation').insideHome(b.entity.position,t.plot))return false;
 if(require('./shelter_policy').threats(b).some(e=>require('./world_navigation').insideHome(e.position,t.plot)))return false;
 const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));
 if(!door?.name.endsWith('_door')||door.getProperties().open)return false;
 const now=Date.now(),n=t.wilderness;
 if(now>=(n.workShellAt||0)){n.workShellAt=now+1000;n.workShell=require('./hut_teacher').intact(b,t.plot);}
 if(!n.workShell)return false;
 const station=(key,name)=>{const block=b.blockAt(house.point(t.plot,key));return block?.name===name&&block.position.distanceTo(b.entity.position)<4?block:null;};
 return tick(t,b,motor,{table:station('table','crafting_table'),hearth:station('furnace','furnace')});
}
function report(t,b){
 const w=t.wilderness.shelterWork;
 const slots=b.inventory.slots||[],items=b.inventory.items();
 return {completed:w?.completed||0,failed:w?.failures||0,last:w?.last||null,reason:w?.reason||null,
  iron:count(b,'iron_ingot'),raw_iron:count(b,'raw_iron'),torches:count(b,'torch'),
  shield:slots[45]?.name==='shield'?durable(b,slots[45]):null,armor:slots.slice(5,9).filter(Boolean).map(i=>i.name),
  equipment:items.filter(i=>UPGRADES.some(([name])=>name===i.name)).map(i=>i.name)};
}
module.exports={tick,atHome,report,choose,count,durable,usable,rules};

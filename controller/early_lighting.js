// First Night: earn lighting before enclosure and extras; recipes stay native.
const {Vec3}=require('vec3'),inventory=require('./inventory_sync'),furnace=require('./furnace'),house=require('./house');
const count=(b,test)=>b.inventory.items().filter(i=>typeof test==='string'?i.name===test:test(i.name)).reduce((s,i)=>s+i.count,0);
const reserveCost=t=>t.wilderness&&!t.supplyRun&&!t.wilderness.lightingKitReady?28:0;
async function planks(t,b,reserve=4){for(const item of [...b.inventory.items()].filter(i=>i.name.endsWith('_log'))){const keep=Math.min(reserve,item.count);reserve-=keep;if(item.count>keep)await t.craft(b,item.name.replace('_log','_planks'),item.count-keep,null);}}
function woodTrip(t){t.wilderness.fuelTrip=true;t.supplyRun=true;t.grove=null;t.resourceAt=0;t.tree=null;t.treeApproach=null;t.phase='gather';t.message='Gathering real wood for safety lighting and torch handles';}
async function tick(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness;if(!n)return false;
 const lit=t.milestones.includes('torch');
 // The floor/table are ready before this point, but the house is not enclosed.
 // Earn the lighting kit before walls/roof can create an unlit spawn space.
 if(t.phase==='build'&&!n.lightingKitReady&&!lit){motor.pause();n.prebuildLighting=true;n.earlyLighting=true;n.lightingPrepared=true;t.phase='night_light_tools';t.lastProgress=Date.now();t.message='Preparing real torch supplies before enclosing the house';return true;}
 if(n.prebuildLighting&&['stone_return','quarry_exit'].includes(t.phase)){
  const goal=t.phase==='stone_return'?[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5]:require('./world_navigation').homeApproach(t.plot,b);
  if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){motor.pause();t.phase=t.phase==='stone_return'?'stone_tools':'quarry';t.lastProgress=Date.now();}
  return true;
 }
 if(n.prebuildLighting&&t.phase==='torch_craft'&&count(b,'torch')>=10){motor.pause();n.prebuildLighting=false;n.lightingKitReady=true;t.phase='build';t.lastProgress=Date.now();t.message='Torch kit ready; building walls with immediate interior lighting';return true;}
 const lighting=require('./house_lighting');
 if(t.phase==='build'&&n.lightingKitReady&&!lighting.installed(b,t.plot,'indoor')&&count(b,'torch')){
  const mount=house.torchMount(t.plot,'indoor');
  if(b.blockAt(mount.support)?.boundingBox==='block'){
   if(mount.position.offset(.5,.5,.5).distanceTo(b.entity.position.offset(0,b.entity.eyeHeight||1.62,0))>=4){await t.walk(b,motor,[t.plot.x-.5,t.plot.y+.1,t.plot.z+.5],state,api,scan,tasks);t.message='Taking a safe interior stance for lighting before finishing the roof';return true;}
   motor.pause();await lighting.place(b,t.plot,'indoor',t);t.lastProgress=Date.now();t.message='Lighting the interior while the house is still being built';return true;
  }
 }
 if(t.phase==='leave_hut'&&n.lightingKitReady&&!lit){motor.pause();n.earlyLighting=true;t.phase=lighting.installed(b,t.plot,'indoor')?'light_exit':'light_inside';t.lastProgress=Date.now();t.message='Verifying house lighting before leaving for settlement supplies';return true;}
 if(t.phase==='supply_craft'&&!lit&&!n.lightingPrepared){
  motor.pause();await planks(t,b);
  n.lightingPrepared=true;t.phase='return_home';t.message='Reserving raw logs for charcoal before settlement extras';return true;
 }
 if(t.phase==='chest'&&!lit){n.earlyLighting=true;t.phase='night_light_tools';return true;}
 if(t.phase==='night_light_tools'){
  motor.pause();if(!count(b,'wooden_pickaxe')){
   if(count(b,'stick')<2)await t.craft(b,'stick',1,null);
   await t.craft(b,'wooden_pickaxe',1,b.blockAt(new Vec3(t.table.x,t.table.y,t.table.z)));await inventory.sync(b);
   if(!count(b,'wooden_pickaxe'))throw Error('Early lighting pickaxe did not arrive');
  }
  t.milestone('wooden_pickaxe');t.phase='quarry_setup';t.lastProgress=Date.now();t.message='Mining furnace stone so the house can be lit first';return true;
 }
 if(t.phase==='smelt'&&count(b,'charcoal')+count(b,'coal')<3){
  motor.pause();if(!count(b,n=>n.endsWith('_log'))){woodTrip(t);return true;}
  if(!count(b,n=>n.endsWith('_planks'))){const log=b.inventory.items().find(i=>i.name.endsWith('_log'));await t.craft(b,log.name.replace('_log','_planks'),1,null);return true;}
  await furnace.charcoal(b,b.blockAt(house.point(t.plot,'furnace')));await inventory.sync(b);t.milestone('charcoal');t.lastProgress=Date.now();t.message='Making charcoal for house and mine torches';return true;
 }
 if(t.phase==='torch_craft'&&count(b,'torch')<10){
  motor.pause();if(!count(b,'charcoal')&&!count(b,'coal')){t.phase='smelt';return true;}
  if(count(b,'stick')<1){
   if(count(b,n=>n.endsWith('_planks'))<2){const log=b.inventory.items().find(i=>i.name.endsWith('_log'));if(!log){woodTrip(t);return true;}await t.craft(b,log.name.replace('_log','_planks'),1,null);return true;}
   await t.craft(b,'stick',1,null);return true;
  }
  await t.craft(b,'torch',1,null);await inventory.sync(b);t.lastProgress=Date.now();t.message='Preparing wall torches and a carried mine-lighting reserve';return true;
 }
 if(t.phase==='light_return'&&n.earlyLighting&&lit&&require('./world_navigation').insideHome(b.entity.position,t.plot)){
  const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));if(door?.getProperties().open&&!await require('./door_care').closeDoor(b,door))return true;
  n.earlyLighting=false;t.phase='leave_hut';t.supplyRun=true;t.lastProgress=Date.now();t.message='House lit and mine torches ready; gathering chest and remaining tool supplies';return true;
 }
 if(t.phase==='quarry_setup'&&lit&&t.milestones.includes('stocked')){t.phase='night_food';t.lastProgress=Date.now();return true;}
 return false;
}
module.exports={tick,reserveCost,planks};

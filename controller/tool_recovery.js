// Replace tools with real inventory/recipes, then resume the interrupted lesson.
const inventory=require('./inventory_sync'),{Vec3}=require('vec3'),house=require('./house');
const count=(b,p)=>b.inventory.items().filter(i=>typeof p==='string'?i.name===p:p(i.name)).reduce((s,i)=>s+i.count,0);
function choose(b,requested){
 const kind=requested?.endsWith('_pickaxe')?'pickaxe':requested?.endsWith('_axe')?'axe':null;
 if(!kind)return count(b,requested)?requested:null;
 const materials=['netherite','diamond','iron','stone','wooden'];
 const minimum=['stone_pickaxe','iron_pickaxe','diamond_pickaxe','netherite_pickaxe'].includes(requested)?materials.indexOf(requested.replace('_pickaxe','')):4;
 return materials.slice(0,minimum+1).map(m=>m+'_'+kind).find(n=>count(b,n))||null;
}
function request(t,tool){
 if(!t.wilderness||!['pickaxe','axe'].some(k=>tool.endsWith('_'+k)))return false;
 t.wilderness.toolRecovery??={requested:tool,resume:t.phase,stage:'return',fuelTrip:!!t.wilderness.fuelTrip,started:Date.now()};
 t.message='Replacing missing '+tool.replaceAll('_',' ')+' before resuming '+t.wilderness.toolRecovery.resume;
 return true;
}
async function tick(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness,r=n?.toolRecovery;if(!r)return false;
 const available=choose(b,r.requested);
 const finish=()=>{t.phase=r.resume;n.fuelTrip=r.fuelTrip;delete n.toolRecovery;t.path=[];t.focusBlock=null;t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();t.message='Tool ready; resuming '+t.phase;};
 if(available){await inventory.equip(b,available);finish();return true;}
 // Leave any intact staircase before routing to the workbench or scouting wood.
 if(n.mine&&!['done','approach'].includes(n.mine.stage)){
  n.mine.stage='exit';n.mine.exitIndex??=n.mine.path.length-1;n.mine.reason='Returning to replace a broken tool';
  await require('./staircase_mining').tick(t,b,motor,state,api,scan,tasks);return true;
 }
 const kind=r.requested.endsWith('_pickaxe')?'pickaxe':'axe';
 const target=kind==='pickaxe'&&r.requested!=='wooden_pickaxe'?'stone_pickaxe':'wooden_'+kind;
 const stone=target.startsWith('stone_'),planks=count(b,n=>n.endsWith('_planks')),logs=count(b,n=>n.endsWith('_log'));
 const needed=(stone?0:3)+(count(b,'stick')>=2?0:2);
 if(planks+logs*4<needed){
  if(r.stage!=='supplies'){r.stage='supplies';t.phase='gather';n.fuelTrip=true;t.grove=null;t.resourceAt=0;t.tree=null;t.treeApproach=null;t.pickup=null;n.searchGoal=null;t.path=[];t.navigator.lastPlan=-Infinity;}
  t.message='Gathering wood for replacement '+target.replaceAll('_',' ');return false;
 }
 r.stage='return';
 const goal=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5];
 if(b.entity.position.distanceTo(new Vec3(...goal))>.65){await t.walk(b,motor,goal,state,api,scan,tasks);t.message='Returning to the workbench to replace '+target;return true;}
 motor.pause();
 const table=b.blockAt(house.point(t.plot,'table'));
 if(table?.name!=='crafting_table'){t.message='Replacement tool needs the home workbench restored';return false;}
 if(stone&&count(b,'cobblestone')<3){
  // A wooden pick can gather replacement stone; never pretend it can mine iron.
  r.requested='wooden_pickaxe';r.stage='return';return true;
 }
 while(count(b,n=>n.endsWith('_planks'))<needed){
  const before=count(b,n=>n.endsWith('_planks')),log=b.inventory.items().find(i=>i.name.endsWith('_log'));
  if(!log)throw Error('Replacement tool wood disappeared during crafting');
  await t.craft(b,log.name.replace('_log','_planks'),1,null);
  if(count(b,n=>n.endsWith('_planks'))<=before)throw Error('Replacement planks were not received from the server');
 }
 if(count(b,'stick')<2)await t.craft(b,'stick',1,null);
 await t.craft(b,target,1,table);await inventory.sync(b);
 if(!count(b,target))throw Error('Replacement tool was not received from the server: '+target);
 await inventory.equip(b,target);finish();return true;
}
module.exports={choose,request,tick};

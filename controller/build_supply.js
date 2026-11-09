// Resume an unfinished enclosure after lighting or safety work spends its wood.
const count=b=>b.inventory.items().reduce((n,i)=>n+(i.name.endsWith('_planks')?i.count:i.name.endsWith('_log')?i.count*4:0),0);
async function tick(t,b,motor,state,api,scan,tasks){
 if(!t.buildSupply&&!['build','table'].includes(t.phase))return false;
 if(['build','table'].includes(t.phase)){
  const table=require('./house').point(t.plot,'table'),missingTable=b.blockAt(table)?.name!=='crafting_table';
  if(t.phase==='table'&&(!missingTable||b.inventory.items().some(i=>i.name==='crafting_table'&&i.count>0)))return false;
  const needed=t.phase==='table'?4:t.requiredWood(b);
  if(!needed&&!missingTable)return false;
  // Convert carried logs before deciding that another harvesting trip is needed.
  const logs=b.inventory.items().filter(i=>i.name.endsWith('_log'));
  if(logs.length){motor.pause();for(const item of logs)await t.craft(b,item.name.replace('_log','_planks'),item.count,null);t.lastProgress=Date.now();return true;}
  if(count(b)>=needed){
   // The table is a wall blueprint cell, but must never be filled with planks
   // when construction resumes after damage or an interrupted placement.
   if(missingTable&&require('./construction_clearance').empty(b.blockAt(table))){
    motor.pause();
    if(!b.inventory.items().some(i=>i.name==='crafting_table'&&i.count>0)){
     await t.craft(b,'crafting_table',1,null);t.lastProgress=Date.now();return true;
    }
    const placed=await require('./station_placement').place(t,b,motor,table,'crafting_table',state,api,scan,tasks);
    if(placed)t.lastProgress=Date.now();
    t.message='Restoring the workbench before resuming the unfinished walls';return true;
   }
   return false;
  }
  motor.pause();t.buildSupply={resumePhase:t.phase};t.phase='gather';t.grove=null;t.resourceAt=0;
  t.tree=null;t.treeApproach=null;t.pickup=null;t.path=[];t.navigator.lastPlan=-Infinity;
  t.message='Gathering missing wall and roof materials before resuming construction';return true;
 }
 if(!t.buildSupply)return false;
 if(t.phase==='gather'){
  if(count(b)<t.requiredWood(b))return false;
  motor.pause();t.phase='build_resupply_return';t.path=[];t.navigator.lastPlan=-Infinity;
  t.lastProgress=Date.now();return true;
 }
 if(t.phase==='build_resupply_return'){
  if(await t.walk(b,motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],state,api,scan,tasks)===true){
   motor.pause();t.phase=t.buildSupply.resumePhase||'build';t.buildSupply=null;t.lastProgress=Date.now();
  }
  t.message='Returning replacement materials to the unfinished house';return true;
 }
 return false; // Danger interrupts remain owned by the survival planner.
}
module.exports={tick,count};

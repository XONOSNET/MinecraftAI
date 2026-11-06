// Resume an unfinished enclosure after lighting or safety work spends its wood.
const count=b=>b.inventory.items().reduce((n,i)=>n+(i.name.endsWith('_planks')?i.count:i.name.endsWith('_log')?i.count*4:0),0);
async function tick(t,b,motor,state,api,scan,tasks){
 if(!t.buildSupply&&t.phase!=='build')return false;
 if(t.phase==='build'){
  const needed=t.requiredWood(b);
  if(!needed)return false;
  // Convert carried logs before deciding that another harvesting trip is needed.
  const logs=b.inventory.items().filter(i=>i.name.endsWith('_log'));
  if(logs.length){motor.pause();for(const item of logs)await t.craft(b,item.name.replace('_log','_planks'),item.count,null);t.lastProgress=Date.now();return true;}
  if(count(b)>=needed)return false;
  motor.pause();t.buildSupply={};t.phase='gather';t.grove=null;t.resourceAt=0;
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
   motor.pause();t.buildSupply=null;t.phase='build';t.lastProgress=Date.now();
  }
  t.message='Returning replacement materials to the unfinished house';return true;
 }
 return false; // Danger interrupts remain owned by the survival planner.
}
module.exports={tick,count};

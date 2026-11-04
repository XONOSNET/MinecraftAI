// A short real wood trip resumes an interrupted bed or cooking task.
const wood=b=>b.inventory.items().reduce((n,i)=>n+(i.name.endsWith('_planks')?i.count:i.name.endsWith('_log')?i.count*4:0),0);
function request(t,resume){
 const n=t.wilderness;n.woodResupply??={resume,fuelTrip:!!n.fuelTrip};
 n.fuelTrip=true;t.phase='gather';t.grove=null;t.resourceAt=0;t.tree=null;t.treeApproach=null;t.pickup=null;n.searchGoal=null;t.path=[];t.navigator.lastPlan=-Infinity;
 t.message='Gathering replacement wood before resuming '+resume;
}
function tick(t,b){
 const n=t.wilderness,r=n?.woodResupply;if(!r||t.phase!=='gather')return false;
 if(wood(b)<3)return false;
 // Reuse the normal doorway-aware home return before using the workbench.
 n.fuelTrip=r.fuelTrip;t.phase=r.resume==='night_bed'?'night_wool_home':'night_food_home';delete n.woodResupply;
 t.path=[];t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();t.message='Replacement wood collected; returning to resume '+r.resume;return true;
}
module.exports={request,tick};

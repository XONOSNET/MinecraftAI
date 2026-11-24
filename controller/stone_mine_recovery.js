// Restore a real mining prerequisite before revisiting the same checked stairs.
const {Vec3}=require('vec3'),house=require('./house'),inventory=require('./inventory_sync');
const tools=require('./tool_recovery'),furnace=require('./furnace'),miningRules=require('../config/mining.json');
const count=(b,test)=>b.inventory.items().filter(i=>typeof test==='string'?i.name===test:test(i.name)).reduce((sum,i)=>sum+i.count,0);
const logs=b=>count(b,name=>name.endsWith('_log'));
const planks=b=>count(b,name=>name.endsWith('_planks'));
const TORCHES=8;

function request(t,result){
 const n=t.wilderness;
 n.stoneRecovery={need:result.recovery,tool:result.required_tool||'wooden_pickaxe',route:result.resume,stage:'supplies',fuelTrip:!!n.fuelTrip};
 n.mine=null;n.stoneApproach=null;n.searchGoal=null;t.path=[];t.navigator.lastPlan=-Infinity;
 t.message='Mine paused for '+result.recovery+' supplies; preserving the checked return stairs';
}
function report(t){
 const r=t.wilderness?.stoneRecovery;
 return r?{need:r.need,stage:r.stage,entry:r.route.entry,trip:r.route.resume_count||0}:null;
}
function gather(t,r){
 if(r.stage!=='wood'){
  r.stage='wood';t.phase='gather';t.wilderness.fuelTrip=true;t.grove=null;t.resourceAt=0;
  t.tree=null;t.treeApproach=null;t.pickup=null;t.stationApproach=null;t.wilderness.searchGoal=null;t.path=[];t.navigator.lastPlan=-Infinity;
 }
 t.message='Gathering wood for mine torches before reusing the staircase';
 return false;
}
async function tick(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness,r=n?.stoneRecovery;
 if(!r||!['night_stone','gather'].includes(t.phase)||n.toolRecovery)return false;
 // The ordinary survival planner runs before this helper and may interrupt it.
 if(!tools.choose(b,r.tool)){
  if(r.tool==='stone_pickaxe'&&count(b,'cobblestone')<3){
   t.failureCategory='resource_unavailable';throw Error('The recorded mine face needs a stone pickaxe and three real cobblestone');
  }
  tools.request(t,r.tool);return true;
 }
 if(r.stage==='wood'){
  if(logs(b)<3)return false;
  n.fuelTrip=r.fuelTrip;t.phase='night_stone';r.stage='supplies';t.path=[];t.navigator.lastPlan=-Infinity;
 }
 const finish=()=>{
  n.stoneRoute=r.route;delete n.stoneRecovery;n.fuelTrip=r.fuelTrip;t.phase='night_stone';
  t.path=[];t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();
  t.message='Mine supplies ready; rechecking the recorded staircase';
 };
 // A tool or shelter return can also exhaust the light needed for revisiting.
 const needsLight=r.need==='light'||r.route.steps>=miningRules.unlit_steps;
 if(!needsLight||count(b,'torch')>=TORCHES){finish();return true;}
 const carbon=count(b,'coal')+count(b,'charcoal');
 const needsFuelWood=!carbon&&(!logs(b)||planks(b)<1&&logs(b)<2);
 const needsHandles=carbon>0&&count(b,'stick')<1&&planks(b)<2&&!logs(b);
 if(needsFuelWood||needsHandles)return gather(t,r);
 const pos=house.point(t.plot,'furnace');
 if(r.stage==='place'&&b.blockAt(pos)?.name==='furnace')r.stage='supplies';
 const goal=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5];
 if(r.stage!=='place'&&b.entity.position.distanceTo(new Vec3(...goal))>.65){
  r.stage='return';await t.walk(b,motor,goal,state,api,scan,tasks);
  t.message='Returning to the workbench for mine lighting supplies';return true;
 }
 if(r.stage!=='place'){motor.pause();r.stage='craft';}
 if(!carbon){
  if(b.blockAt(pos)?.name!=='furnace'){
   if(!count(b,'furnace')){
    if(count(b,'cobblestone')<8){
     t.failureCategory='resource_unavailable';
     throw Error('Mine lighting needs coal or eight real cobblestone for a furnace; preserving the darkness limit');
    }
    const table=b.blockAt(house.point(t.plot,'table'));
    if(table?.name!=='crafting_table')throw Error('Mine lighting needs the home workbench restored');
    await t.craft(b,'furnace',1,table);await inventory.sync(b);
    if(!count(b,'furnace'))throw Error('Mine lighting furnace was not received from the server');
   }
   r.stage='place';
   if(!await require('./station_placement').place(t,b,motor,pos,'furnace',state,api,scan,tasks))return true;
  }
  motor.pause();
  if(!planks(b)){
   const log=b.inventory.items().find(i=>i.name.endsWith('_log'));
   await t.craft(b,log.name.replace('_log','_planks'),1,null);await inventory.sync(b);
   if(!planks(b))throw Error('Mine lighting planks were not received from the server');
   return true;
  }
  r.stage='smelt';await furnace.charcoal(b,b.blockAt(pos));await inventory.sync(b);
  if(!count(b,'charcoal'))throw Error('Mine lighting charcoal was not received from the furnace');
  t.lastProgress=Date.now();return true;
 }
 if(!count(b,'stick')){
  if(planks(b)<2){
   const log=b.inventory.items().find(i=>i.name.endsWith('_log'));
   await t.craft(b,log.name.replace('_log','_planks'),1,null);
  }else await t.craft(b,'stick',1,null);
  await inventory.sync(b);return true;
 }
 const before=count(b,'torch');await t.craft(b,'torch',1,null);await inventory.sync(b);
 if(count(b,'torch')<=before)throw Error('Mine torches were not received from the server');
 t.lastProgress=Date.now();t.message='Preparing real torches to resume the recorded staircase';return true;
}
module.exports={request,tick,report};

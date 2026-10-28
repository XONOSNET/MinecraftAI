// Scripted hut teacher composes real harvesting, crafting and block placement.
// Only the movement decisions can be student-controlled in this first version.
const {Vec3}=require('vec3');
const crafting=require('./crafting');
const inventorySync=require('./inventory_sync');
const {harvest,aim,level}=require('./harvest');
const {harvestable}=require('./resource_target');
const resourceAccess=require('./resource_access');
const {route,standable}=require('./field_navigation');
const {WorldTiming}=require('./world_timing');
const space=require('./resource_space');
const {forBot}=require('./behavior');
const {chooseTree}=require('./tree_target');
const settlement=require('./settlement');
const {scanTrees,visibleBlock}=require('./target_scan');
const {closeDoor}=require('./door_care');
const furnace=require('./furnace');
const {WorldStall}=require('./world_stall');
const {WorldNavigation,routeDoorway}=require('./world_navigation');
const survival=require('./survival');
const firstNight=require('./first_night');
const house=require('./house');
const houseLighting=require('./house_lighting');
const survey=require('./survey'),resourceScan=require('./resource_scan'),serviceErrors=require('./service_errors');
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
const planks=name=>name.endsWith('_planks');
const count=(bot,match)=>bot.inventory.items().filter(i=>match(i.name)).reduce((n,i)=>n+i.count,0);
function safeResource(bot,p){for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-2;dy<=1;dy++){const b=bot.blockAt(new Vec3(p.x+dx,p.y+dy,p.z+dz));if(!b||['water','lava','fire','soul_fire'].includes(b.name))return false;}return true;}
function woodDrop(bot,e,match=n=>LOG.test(n)||planks(n)){const key=bot.registry.entitiesByName.item.metadataKeys.indexOf('item'),slot=e.metadata?.[key];if(!slot)return false;try{const item=require('prismarine-item')(bot.registry).fromNotch(slot);return !!item&&match(item.name);}catch{return false;}}
function surface(bot,x,z){
 // Inspect only the exposed surface, never an air pocket underneath solid ground.
 for(let y=190;y>=0;y--){const block=bot.blockAt(new Vec3(x,y,z));if(!block)return null;
  if(block.name.endsWith('_leaves'))continue;
  if(block.boundingBox==='block'||['water','lava'].includes(block.name))return standable(bot,x,y+1,z)&&!LOG.test(block.name)?y+1:null;
 }return null;
}
function findSpawn(bot,bounds,{margin=8}={}){
 const cx=Math.floor((bounds[0]+bounds[1])/2),cz=Math.floor((bounds[2]+bounds[3])/2);let best=null,score=-Infinity;
 const radius=Math.min(48,Math.floor(Math.min(bounds[1]-bounds[0],bounds[3]-bounds[2])/2)-margin);
 for(let dx=-radius;dx<=radius;dx+=3)for(let dz=-radius;dz<=radius;dz+=3){const x=cx+dx,z=cz+dz,y=surface(bot,x,z);if(y===null)continue;
  let valid=true;for(let a=-1;a<=1&&valid;a++)for(let b=-1;b<=1;b++)if(!standable(bot,x+a,y,z+b)){valid=false;break;}
  if(!valid)continue;
  for(let a=-6;a<=6&&valid;a++)for(let b=-6;b<=6&&valid;b++)for(let h=-3;h<=2;h++){const block=bot.blockAt(new Vec3(x+a,y+h,z+b));if(!block||['lava','fire','magma_block','water'].includes(block.name)){valid=false;break;}}
  const value=y-Math.hypot(dx,dz)*.1;if(valid&&value>score){score=value;best=[x+.5,y+.1,z+.5];}
 }return best;
}
function findPlot(bot,bounds,index,spread,total=8){
 const width=bounds[1]-bounds[0],depth=bounds[3]-bounds[2],columns=Math.min(4,total),rows=Math.ceil(total/columns);
 const ox=Math.floor(bounds[0]+(index%columns+.5)*width/columns),oz=Math.floor(bounds[2]+(Math.floor(index/columns)+.5)*depth/rows),radius=Math.floor(Math.min(width/columns,depth/rows)/2)-4;
 const cache=new Map(),height=(x,z)=>{const key=x+','+z;if(!cache.has(key))cache.set(key,surface(bot,x,z));return cache.get(key);};
 for(let r=0;r<=radius;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
  if(Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;
  const x=ox+dx,z=oz+dz,y=height(x,z);if(y===null||x<bounds[0]+5||x>bounds[1]-6||z<bounds[2]+5||z>bounds[3]-6)continue;
  let flat=true;for(let a=-3;a<=3&&flat;a++)for(let b=-3;b<=3;b++)if(height(x+a,z+b)!==y){flat=false;break;}
  if(flat){const tableY=height(x-3,z+3);if(tableY!==null&&Math.abs(tableY-y)<3)return {x,y,z,tableY};}
 }return null;
}
const blueprint=house.blueprint;
function matches(bot,p){const name=bot.blockAt(new Vec3(p.x,p.y,p.z))?.name||'';return p.table?name==='crafting_table':planks(name);}
function intact(bot,plot){return blueprint(plot).every(p=>matches(bot,p));}
function reference(bot,p){for(const [dx,dy,dz] of [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]){
 const b=bot.blockAt(new Vec3(p.x+dx,p.y+dy,p.z+dz));if(b&&b.boundingBox==='block'&&!['crafting_table','chest','barrel'].includes(b.name)&&!b.name.endsWith('_door'))return {block:b,face:new Vec3(-dx,-dy,-dz)};
}return null;}
class HutTeacher{
 constructor(){this.run=null;this.navigator=new WorldNavigation();}
 async tick(bot,motor,state,api,scan,tasks){
  const now=Date.now(),p=bot.entity.position,w=state.world,rules=forBot(bot);
  if(this.run===state.run&&now<(this.serviceRetryAt||0)){motor.pause();return this.message;}
  if(this.run!==state.run){this.stall=new WorldStall(rules.stationary_timeout_seconds);this.navigator=new WorldNavigation();}
  if(this.run!==state.run){space.release(bot.username);require('./exploration').release(bot.username);this.resourceAccess={};this.treeRetry=0;this.focusBlock=null;this.lastNavigation=null;if(this.survival?.deathListener)bot.removeListener('entityDead',this.survival.deathListener);this.survival=null;this.wilderness=null;this.failureCategory=null;this.serviceFailureSince=null;this.serviceRetryAt=0;this.home=null;this.run=state.run;this.phase='survey';this.started=now;this.lastReport=0;this.travelled=0;this.last=p.clone();this.path=[];this.lastPlan=0;this.lastProgress=now;this.anchor=p.clone();this.runtime=tasks.createRuntime();this.harvested=0;this.error=null;this.spawned=false;this.ignoredTrees=new Map();this.ignoredDrops=new Map();this.resourceAt=0;this.grove=null;this.inventoryAt=0;this.plot=null;this.campPlots=[];this.table=null;this.built=0;this.secureAt=null;this.settle=0;this.resources=[];this.destination=null;this.tree=null;this.treeApproach=null;this.pickup=null;this.timing=new WorldTiming(now);this.milestones=[];this.supplyRun=false;this.collecting=false;this.scanCount=0;this.observedTrees=0;this.quarry=null;this.lastRecoveryReset=0;console.log(JSON.stringify({event:'world_controller',agent:bot.username,gameMode:bot.game.gameMode}));}
  if(this.phase==='survey')survey.hold(bot);else survey.release(bot);
  if(firstNight.enabled(w)&&!this.wilderness)firstNight.init(this,w);
  if(this.wilderness&&this.phase!=='survey'){this.wilderness.memory.observe(bot);this.wilderness.exploration?.observe(p);}
  this.timing.mark(this.phase,'waiting',now);
  const moved=Math.hypot(p.x-this.last.x,p.z-this.last.z);if(moved<4&&this.phase!=='survey')this.travelled+=moved;this.last=p.clone();
  if(Math.hypot(p.x-this.anchor.x,p.z-this.anchor.z)>1){this.anchor=p.clone();this.lastProgress=now;}
  this.message='';this.navigationActive=false;this.harvestTarget=null;this.harvestKind='approach';
  if(!['gather','quarry','fuel_log','survival_coal','survival_iron','survival_wood'].includes(this.phase))space.release(bot.username);
  if(this.phase!=='survey'&&!this.inside(p,w.bounds)){this.error='Reached the simulation boundary; stopped.';this.phase='stopped';}
  if(this.phase!=='survey'&&now>this.settle&&(bot.health<(this.wilderness?6:10)||bot.food<(this.wilderness?2:5))){this.error='Health or food too low to continue safely.';this.phase='stopped';}
  if(now-this.started>((w.time_budget_seconds||1200)-50)*1000){this.error='Trial time limit reached.';this.phase='stopped';}
  const stock=bot.inventory.items().map(i=>i.name+':'+i.count).sort().join(','),stall=this.stall.update(p,[this.phase,this.built,this.harvested,this.milestones.length,stock].join('|'),now);
  if(stall.expired&&!['survey','complete','stopped','night_hold','night_recover'].includes(this.phase)){this.error=`Stationary for ${rules.stationary_timeout_seconds} seconds without material or lesson progress; ending this attempt so learning can continue.`;this.phase='stopped';}
  let connectionRetry=false;
  try{
   if(this.phase==='survey'&&now-this.started<4000){motor.pause();this.message='Waiting for natural terrain chunks';}
   else if(this.phase==='survey'){
    motor.pause();
    if(now<(this.surveyNextAt||0)){this.message='Surveying loaded terrain for dry, safe ground';return this.message;}this.surveyNextAt=now+1000;
    const spawn=w.prepared&&w.camp_anchor&&standable(bot,...w.camp_anchor)?[w.camp_anchor[0]+.5,w.camp_anchor[1]+.1,w.camp_anchor[2]+.5]:findSpawn(bot,w.bounds,{margin:w.prepared?house.config.camp_radius+2:8});
    if(!spawn){this.message='Surveying loaded terrain for a safe shared spawn';if(now-this.started>30000){this.failureCategory='site_unavailable';throw Error('No safe natural spawn found. Try another site.');}}
    else{let destination=spawn;if(w.prepared){const camp=await api('/world/camp',{agent:bot.username,position:spawn});this.campPlots=camp.plots;this.plot=camp.plots[w.index];this.grove=camp.groves[w.index]?.length?camp.groves[w.index]:null;destination=camp.spawn;}else{this.plot=findPlot(bot,w.bounds,w.index,w.spread,w.count||8);if(!this.plot){this.failureCategory='site_unavailable';throw Error('No flat 7 × 7 build site in this bot’s sector. Try another natural scenario.');}}await api('/world/spawn',{agent:bot.username,position:destination});this.phase='gather';survey.release(bot);this.settle=now+1500;if(this.wilderness){this.wilderness.memory.remember('home',[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5]);}}
   }else if(now<this.settle){motor.pause();this.message='Settling on natural ground';}
   else if(this.resourceAccess?.column?.length){await this.workElevated(bot,motor,state,api,scan,tasks);}
   else if(this.wilderness&&!['complete','stopped'].includes(this.phase)&&await firstNight.interrupt(this,bot,motor,state)){/* safety priority handled */}
   else if(firstNight.handles(this.phase)){await firstNight.tick(this,bot,motor,state,api,scan,tasks,surface);}
   else if(this.phase==='gather'){
    for(const [id,until] of this.ignoredTrees)if(now>until)this.ignoredTrees.delete(id);
    for(const [id,until] of this.ignoredDrops)if(now>until)this.ignoredDrops.delete(id);
    if(now-this.inventoryAt>1500){await inventorySync.sync(bot);this.inventoryAt=now;}
    if(this.wilderness&&!this.wilderness.bootstrap&&count(bot,n=>LOG.test(n))>=4){motor.pause();this.phase='night_bootstrap';}
    else if(this.wilderness?.fuelTrip&&count(bot,n=>LOG.test(n))>=4){this.wilderness.fuelTrip=false;this.phase='stone_return';motor.pause();}
    else if(count(bot,n=>LOG.test(n))*4+count(bot,planks)>=(this.supplyRun?28:this.requiredWood(bot))){motor.pause();this.phase=this.supplyRun?'supply_craft':'craft';}
    else{
     if(!this.resourceAt||now-this.resourceAt>rules.resource_scan_ms){this.resources=this.grove?this.grove.flatMap(([x,y,z])=>[0,1,2,3,4,5].map(dy=>new Vec3(x,y+dy,z))):(await resourceScan.logs(bot,{bounds:w.bounds})).filter(v=>this.inside(v,w.bounds)&&safeResource(bot,v)&&(!this.wilderness||w.first_night.trees||visibleBlock(bot,bot.blockAt(v))||resourceAccess.obstruction(bot,v)));this.resourceAt=now;}
     if(this.grove&&!this.resources.some(v=>LOG.test(bot.blockAt(v)?.name||''))){this.grove=null;this.resourceAt=0;}
     let targets=this.resources.filter(v=>!this.ignoredTrees.has(v.x+','+v.z)&&LOG.test(bot.blockAt(v)?.name||'')).sort((a,b)=>a.distanceTo(p)-b.distanceTo(p));
     let focused={key:null,targets:[]};
     const drops=Object.values(bot.entities).filter(e=>e.name==='item'&&woodDrop(bot,e)&&Math.abs(e.position.y-p.y)<1.7&&e.position.distanceTo(p)<6&&(!this.ignoredDrops?.has(e.id))&&!space.busy(bot,state.run,e.position)).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p));
     const pendingDrops=this.tree&&!targets.some(v=>v.x+','+v.z===this.tree)&&drops.some(e=>Math.hypot(e.position.x-Number(this.tree.split(',')[0])-.5,e.position.z-Number(this.tree.split(',')[1])-.5)<2);
     if(!pendingDrops&&(this.tree||now>this.treeRetry)){
      if(!this.tree||!targets.some(v=>v.x+','+v.z===this.tree)){this.scanCount++;this.observedTrees=scanTrees(bot).length;}
      focused=chooseTree(bot,targets,this.tree,surface,state.run,this.treeApproach);
      if(!focused.key)this.treeRetry=now+rules.tree_retry_ms;
     }
     if(!pendingDrops&&focused.key!==this.tree){this.resourceAccess={};if(this.tree)this.timing.targets++;this.tree=pendingDrops?this.tree:focused.key;this.treeApproach=focused.approach||null;this.path=[];}
     else if(!pendingDrops&&focused.approach&&JSON.stringify(focused.approach)!==JSON.stringify(this.treeApproach)){this.treeApproach=focused.approach;this.path=[];}
     targets=focused.targets;
     if(targets.length){if(this.wilderness)delete this.wilderness.noResourceAt;space.reserve(bot,state.run,targets[0].offset(.5,0,.5));this.harvestTarget=targets[0];this.wilderness?.memory.remember('wood',targets[0]);}
     else space.release(bot.username);
     const drop=drops.find(e=>e.id===this.pickup)||drops[0];this.pickup=drop?.id??null;
     const collecting=drop&&!targets.length&&Math.hypot(drop.position.x-p.x,drop.position.z-p.z)>1;
     let target=targets.find(v=>Math.hypot(v.x+.5-p.x,v.z+.5-p.z)<3.5&&harvestable(bot,v));
     if(target){await this.harvest(bot,motor,target,state,api,scan,tasks);}
     else if(collecting){this.collecting=true;const moved=await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);this.collecting=false;if(moved===false){this.ignoredDrops.set(drop.id,now+5000);this.pickup=null;}this.message='Collecting harvested drops';}
     else if(targets.length){let destination=this.treeApproach,chosenTree=targets[0];
      if(destination&&!standable(bot,Math.floor(destination[0]),Math.round(destination[1]),Math.floor(destination[2])))destination=null;
      if(!destination){const approaches=[];for(const block of targets)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const y=surface(bot,block.x+dx,block.z+dz);if(y!==null&&block.y-y<3.2&&block.y-y>-.5)approaches.push([block.x+dx+.5,y+.1,block.z+dz+.5]);}
       approaches.sort((a,b)=>Math.hypot(a[0]-p.x,a[2]-p.z)-Math.hypot(b[0]-p.x,b[2]-p.z));destination=approaches[0];this.treeApproach=destination||null;}

      if(destination){
       const near=Math.hypot(destination[0]-p.x,destination[2]-p.z)<.65&&Math.abs(destination[1]-p.y)<.6;
       const access=near?await this.accessResource(bot,motor,chosenTree,state):null;
       const moved=access?.handled?undefined:await this.walk(bot,motor,destination,state,api,scan,tasks);
       if(access?.handled)this.message=access.message;
       if((moved===false||moved===true)&&chosenTree&&bot.entity.onGround){
        this.ignoredTrees.set(chosenTree.x+','+chosenTree.z,now+15000);this.tree=null;this.treeApproach=null;this.harvestTarget=null;
        space.release(bot.username);motor.pause();await level(bot);
        this.message=moved===true?'Remaining logs are blocked from this approach; checking another tree':'Tree approach is blocked; checking other resources';
       }
       this.message=this.message||'Approaching selected tree';
      }else{motor.pause();this.message='Tree has no safe approach';this.resourceAt=0;
       const access=await this.accessResource(bot,motor,chosenTree,state);
       if(access.handled){this.message=access.message;}
       else if(chosenTree){this.ignoredTrees.set(chosenTree.x+','+chosenTree.z,now+15000);this.tree=null;this.treeApproach=null;this.message='Skipping a tree with no safe approach; checking other resources';}
      }}
     else{if(this.wilderness)await firstNight.explore(this,bot,motor,state,api,scan,tasks,surface,'wood');else{motor.pause();await level(bot);this.message='Scanning for another reachable tree; previous upper logs may be out of reach';}}
     this.message=this.message||`Harvesting logs ${count(bot,n=>LOG.test(n))} / ${Math.ceil(this.requiredWood(bot)/4)}`;
    }
   }else if(this.phase==='craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();for(const item of [...bot.inventory.items()].filter(i=>LOG.test(i.name))){const name=item.name.replace('_log','_planks'),id=bot.registry.itemsByName[name]?.id;const recipe=id&&bot.recipesFor(id,null,1,null)[0];if(recipe)await crafting.craft(bot,name,item.count,null);}
    this.table=house.point(this.plot,'table');
    if(bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z))?.name!=='crafting_table'&&!count(bot,n=>n==='crafting_table'))await this.craft(bot,'crafting_table',1,null);
    this.phase='floor';
   }else if(this.phase==='floor'){
    await this.buildFloor(bot,motor,state,api,scan,tasks);
   }else if(this.phase==='table'){
    if(bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z))?.name==='crafting_table'){this.phase='door_craft';motor.pause();}
    else if(p.distanceTo(new Vec3(this.table.x,this.table.y,this.table.z))>3.5)await this.walk(bot,motor,[this.table.x+1.5,this.table.y+.1,this.table.z+.5],state,api,scan,tasks);
    else{motor.pause();await this.place(bot,this.table,'crafting_table');this.phase='door_craft';}
   }else if(this.phase==='door_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();const table=bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z));
    if(!count(bot,n=>n.endsWith('_door'))&&!bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3))?.name.endsWith('_door')){
    const totals=new Map();for(const item of bot.inventory.items())if(planks(item.name))totals.set(item.name,(totals.get(item.name)||0)+item.count);
    const wood=bot.inventory.items().filter(i=>planks(i.name)&&totals.get(i.name)>=6).sort((a,b)=>totals.get(b.name)-totals.get(a.name))[0];if(!wood)throw Error('No planks available after crafting.');
    await this.craft(bot,wood.name.replace('_planks','_door'),1,table);
    }this.phase='build';
   }else if(this.phase==='build'){
    if(Math.abs(p.x-this.plot.x-.5)>2||Math.abs(p.z-this.plot.z-.5)>2||Math.abs(p.y-this.plot.y)>.3){await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);this.message='Taking position inside the hut';}
    else{
    const remaining=blueprint(this.plot).filter(q=>!matches(bot,q));
    this.built=house.total-remaining.length;
    if(!remaining.length){this.phase='door';motor.pause();}
    else{
     const q=remaining.find(q=>new Vec3(q.x+.5,q.y+.5,q.z+.5).distanceTo(p.offset(0,1.62,0))<4.2&&reference(bot,q));
     if(q){motor.pause();const occupied=bot.blockAt(new Vec3(q.x,q.y,q.z));if(occupied?.name.endsWith('_leaves')&&bot.canDigBlock(occupied)){await bot.dig(occupied);return 'Clearing leaves from hut footprint';}if(!occupied||occupied.boundingBox!=='empty')throw Error('Build plot was obstructed; stopped without clearing terrain.');await this.place(bot,q,null);this.lastProgress=Date.now();}
     else{const q=remaining[0];await this.walk(bot,motor,[this.plot.x+Math.max(-1,Math.min(1,q.x-this.plot.x))+.5,this.plot.y+.1,this.plot.z+Math.max(-1,Math.min(1,q.z-this.plot.z))+.5],state,api,scan,tasks);}
     this.message=`Placing hut blocks ${this.built} / ${house.total}`;
    }
    }
   }else if(this.phase==='door'){
    const door={x:this.plot.x,y:this.plot.y,z:this.plot.z-3};
    if(bot.blockAt(new Vec3(door.x,door.y,door.z))?.name.endsWith('_door')){this.phase='enter';motor.pause();}
    else if(p.offset(0,1.62,0).distanceTo(new Vec3(door.x+.5,door.y+.5,door.z+.5))>4.2)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
    else{motor.pause();const item=bot.inventory.items().find(i=>i.name.endsWith('_door'));if(!item)throw Error('Crafted door missing.');await bot.look(Math.PI,0,true);await this.place(bot,door,item.name);this.phase='enter';}
   }else if(this.phase==='enter'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(!door?.name.endsWith('_door'))throw Error('Door placement did not create a usable entrance.');
    if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)<.8&&Math.abs(p.y-this.plot.y)<.4){motor.pause();if(door.getProperties().open&&!await closeDoor(bot,door)){this.message='Waiting for the doorway to clear before closing';return this.message;}this.secureAt=now;this.phase='shelter';}
    else{if(!door.getProperties().open&&p.z<door.position.z+.5&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}else await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);}
   }else if(this.phase==='shelter'){
    motor.pause();const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(!intact(bot,this.plot)||!door?.name.endsWith('_door')||door.getProperties().open)throw Error('Hut enclosure failed final verification.');
    if(now-this.secureAt>=3000){this.milestone('hut');this.phase=w.mission!=='hut'?'leave_hut':'complete';this.message='Hut verified. '+(w.mission!=='hut'?'Next: gather supplies for a chest and tools.':'Built an intact enclosed hut, closed the door and sheltered for 3 seconds.');}
   }else if(this.phase==='leave_hut'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(door?.name.endsWith('_door')&&!door.getProperties().open&&p.z>door.position.z+.5){motor.pause();await bot.activateBlock(door);}
    else if((Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z+4.5)>.6||Math.abs(p.y-this.plot.y)>.4))await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z-4.5],state,api,scan,tasks);
    else{motor.pause();this.supplyRun=true;this.grove=w.prepared?(await api('/world/resources',{agent:bot.username})).trees:null;this.resources=[];this.resourceAt=0;this.tree=null;this.treeApproach=null;this.pickup=null;this.ignoredTrees.clear();this.ignoredDrops.clear();this.phase='gather';this.lastProgress=now;this.message='Lesson resources ready: harvest extra wood for chest, tools and stored supplies';}
   }else if(this.phase==='supply_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();
    for(const item of [...bot.inventory.items()].filter(i=>LOG.test(i.name)))await this.craft(bot,item.name.replace('_log','_planks'),item.count,null);
    this.phase='return_home';this.lastProgress=Date.now();
   }else if(this.phase==='return_home'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(door?.name.endsWith('_door')&&!door.getProperties().open&&p.z<door.position.z+.5&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}
    else if((Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)>.45||Math.abs(p.y-this.plot.y)>.4))await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
    else{motor.pause();this.phase='chest';this.lastProgress=now;}
   }else if(this.phase==='chest'){
    this.timing.mark(this.phase,'crafting');motor.pause();const pos=settlement.chestPosition(this.plot);
    if(bot.blockAt(pos)?.name!=='chest'){if(!count(bot,n=>n==='chest'))await this.craft(bot,'chest',1,bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z)));await this.place(bot,pos,'chest');}
    if(bot.blockAt(pos)?.name!=='chest')throw Error('Chest placement not verified');
    this.milestone('chest');this.phase='tools';this.lastProgress=Date.now();
   }else if(this.phase==='tools'){
    this.timing.mark(this.phase,'crafting');motor.pause();const table=bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z));
    const tool=settlement.TOOLS.find(name=>!count(bot,n=>n===name));
    if(tool){if(count(bot,n=>n==='stick')<2)await this.craft(bot,'stick',1,null);await this.craft(bot,tool,1,table);await inventorySync.sync(bot);if(!count(bot,n=>n===tool))throw Error('Tool was not received from the server');this.milestone(tool);this.lastProgress=Date.now();this.message='Crafted '+tool.replaceAll('_',' ');}
    else{for(const name of settlement.TOOLS)this.milestone(name);this.phase='stock_chest';}
   }else if(this.phase==='stock_chest'){
    this.timing.mark(this.phase,'stocking');motor.pause();const stored=await settlement.stockChest(bot,bot.blockAt(settlement.chestPosition(this.plot)),8);
    await inventorySync.equip(bot,'wooden_axe');
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));if(door?.getProperties().open&&!await closeDoor(bot,door))return 'Waiting for the doorway to clear before closing';
    if(!intact(bot,this.plot)||!settlement.TOOLS.every(name=>count(bot,n=>n===name)>0)||stored<8)throw Error('Settlement final verification failed');
    this.milestone('stocked');this.phase=w.mission!=='settlement'?'quarry_setup':'complete';this.message=w.mission!=='settlement'?'Settlement verified. Next: mine stone, upgrade tools, build a furnace and make lighting.':'Settlement complete: enclosed hut, chest with 8 planks, pickaxe, axe and shovel; axe equipped.';
   }else if(this.phase==='quarry_setup'){
    motor.pause();if(this.wilderness&&!w.first_night.stations){this.phase='night_stone';}else{this.quarry=await api('/world/quarry',{agent:bot.username});this.phase='quarry_exit';}this.lastProgress=now;
   }else if(this.phase==='quarry_exit'||this.phase==='light_exit'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(door&&!door.getProperties().open&&p.z>door.position.z+.5){motor.pause();await bot.activateBlock(door);}
    else if((Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z+4.5)>.6||Math.abs(p.y-this.plot.y)>.4))await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z-4.5],state,api,scan,tasks);
    else{motor.pause();this.phase=this.phase==='quarry_exit'?'quarry':'light_place';this.lastProgress=now;}
   }else if(this.phase==='quarry'){
    const cobble=count(bot,n=>n==='cobblestone');this.message=`Mining stone ${cobble} / ${Math.ceil(this.requiredWood(bot)/4)}`;
    if(cobble>=16){this.milestone('quarry');this.phase='fuel_log';motor.pause();}
    else{
     const blocks=this.quarry.blocks.map(v=>bot.blockAt(new Vec3(...v))).filter(b=>b?.name==='stone').sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p));
     const drop=Object.values(bot.entities).filter(e=>e.name==='item'&&woodDrop(bot,e,n=>n==='cobblestone')&&Math.abs(e.position.y-p.y)<1.7&&e.position.distanceTo(p)<7).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p))[0];
     const target=blocks.find(b=>!space.busy(bot,state.run,b.position)&&b.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&visibleBlock(bot,b)&&bot.canDigBlock(b));
     this.harvestTarget=target?.position||blocks[0]?.position||null;
     if(target)await this.harvest(bot,motor,target.position,state,api,scan,tasks,'wooden_pickaxe');
     else if(blocks.length)await this.walk(bot,motor,this.quarry.approach,state,api,scan,tasks);
     else if(drop&&space.clearOfPlayers(bot,drop.position)&&Math.hypot(drop.position.x-p.x,drop.position.z-p.z)>1)await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);
     else if(cobble>=14){this.milestone('quarry');this.phase='fuel_log';motor.pause();}
     else motor.pause();
    }
   }else if(this.phase==='fuel_log'){
    if(count(bot,n=>LOG.test(n))>=(this.wilderness?4:2)){motor.pause();this.phase='stone_return';}
    else{
     const drop=Object.values(bot.entities).find(e=>e.name==='item'&&woodDrop(bot,e)&&e.position.distanceTo(p)<7);
     const block=this.quarry.fuel.map(v=>bot.blockAt(new Vec3(...v))).filter(b=>b&&LOG.test(b.name)).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p))[0];
     this.harvestTarget=block?.position||null;
     if(block&&block.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&visibleBlock(bot,block))await this.harvest(bot,motor,block.position,state,api,scan,tasks,'wooden_axe');
     else if(block)await this.walk(bot,motor,[block.position.x-1.5,this.plot.y+.1,block.position.z+.5],state,api,scan,tasks);
     else if(drop&&space.clearOfPlayers(bot,drop.position))await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);
    }
   }else if(this.phase==='stone_return'||this.phase==='light_return'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3));
    if(door&&!door.getProperties().open&&p.z<door.position.z+.5&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}
    else if((Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)>.45||Math.abs(p.y-this.plot.y)>.4))await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
    else{motor.pause();if(this.phase==='stone_return')this.phase='stone_tools';else{if(door.getProperties().open&&!await closeDoor(bot,door))return 'Waiting for the doorway to clear before closing';this.phase=this.wilderness?'night_food':survival.advanced(w.mission)?'survival_setup':'complete';this.message='Stone-age base complete: stocked hut, wooden and stone tools, working furnace, charcoal and indoor/outdoor wall torches.';}this.lastProgress=now;}
   }else if(this.phase==='stone_tools'){
    this.timing.mark(this.phase,'crafting');motor.pause();const table=bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z));
    const tool=['stone_pickaxe','stone_axe'].find(name=>!count(bot,n=>n===name));
    // Keep one raw log for charcoal; the second supplies handles and furnace fuel.
    if(tool==='stone_pickaxe'&&count(bot,planks)<3){const log=bot.inventory.items().find(i=>LOG.test(i.name));if(count(bot,n=>LOG.test(n))<2)throw Error('Reserve a charcoal log before making tool supplies');await this.craft(bot,log.name.replace('_log','_planks'),1,null);}
    if(tool){if(count(bot,n=>n==='stick')<2)await this.craft(bot,'stick',1,null);await this.craft(bot,tool,1,table);this.milestone(tool);this.lastProgress=Date.now();}
    else this.phase='furnace';
   }else if(this.phase==='furnace'){
    this.timing.mark(this.phase,'crafting');motor.pause();const pos=house.point(this.plot,'furnace');
    if(bot.blockAt(pos)?.name!=='furnace'){if(!count(bot,n=>n==='furnace'))await this.craft(bot,'furnace',1,bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z)));await this.place(bot,pos,'furnace');}
    this.milestone('furnace');this.phase='smelt';this.lastProgress=Date.now();
   }else if(this.phase==='smelt'){
    this.timing.mark(this.phase,'smelting');motor.pause();if(!count(bot,n=>n==='charcoal'))await furnace.charcoal(bot,bot.blockAt(house.point(this.plot,'furnace')));
    await inventorySync.sync(bot);if(!count(bot,n=>n==='charcoal'))throw Error('Charcoal was not received from the furnace');this.milestone('charcoal');this.phase='torch_craft';this.lastProgress=Date.now();
   }else if(this.phase==='torch_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();if(count(bot,n=>n==='torch')<houseLighting.missing(bot,this.plot)){if(count(bot,n=>n==='stick')<1)await this.craft(bot,'stick',1,null);await this.craft(bot,'torch',1,null);}this.phase='light_inside';
   }else if(this.phase==='light_inside'){
    motor.pause();await houseLighting.place(bot,this.plot,'indoor');this.phase='light_exit';this.lastProgress=Date.now();this.message='Indoor wall torch installed; heading outside to light the entrance';
   }else if(this.phase==='light_place'){
    motor.pause();await houseLighting.place(bot,this.plot,'outdoor');
    if(houseLighting.missing(bot,this.plot))throw Error('Both indoor and outdoor wall torches must verify');this.milestone('torch');await inventorySync.equip(bot,'stone_axe');this.phase='light_return';this.lastProgress=Date.now();this.message='Both wall torches verified; returning inside';
   }else if(survival.handles(this.phase)){await survival.tick(this,bot,motor,state,api,scan,tasks);}
   else motor.pause();
   if(!firstNight.handles(this.phase)&&!survival.handles(this.phase)&&!['survey','gather','craft','door_craft','supply_craft','chest','tools','stock_chest','quarry','fuel_log','stone_tools','furnace','smelt','torch_craft','shelter','complete','stopped'].includes(this.phase)&&now-this.lastProgress>60000)throw Error('No construction or movement progress for 60 seconds.');
  }catch(error){motor.pause();connectionRetry=serviceErrors.recover(this,error);if(!connectionRetry){survey.release(bot);this.error=this.phase+': '+error.message;this.phase='stopped';}}
  if(!connectionRetry)this.serviceFailureSince=null;
  if(now-this.lastReport>1000||['complete','stopped'].includes(this.phase)){
   const reportLogs=this.phase==='survey'||Date.now()<this.settle?0:count(bot,n=>LOG.test(n));
   const resourceProgress=this.phase==='quarry'?`Cobblestone ${count(bot,n=>n==='cobblestone')} / 16 · `:this.phase==='fuel_log'?`Fuel logs ${reportLogs} / 2 · `:'';
   if(['complete','stopped'].includes(this.phase)){require('./exploration').release(bot.username);if(this.survival?.deathListener){bot.removeListener('entityDead',this.survival.deathListener);this.survival.deathListener=null;}space.release(bot.username);this.harvestTarget=null;}
   await api('/world/report',{wilderness:firstNight.report(this),failure_category:this.failureCategory||(this.phase==='stopped'?(this.error?.includes('Health')?'unsafe':this.error?.includes('time limit')?'deadline':'stalled'):null),home:this.home,survival:this.survival?{iron_target:this.survival.station?.iron_target,raw_iron:count(bot,n=>n==='raw_iron'),iron:count(bot,n=>n==='iron_ingot'),coal:count(bot,n=>n==='coal'),wool:count(bot,n=>n==='white_wool'),food:count(bot,n=>n==='cooked_beef')}:null,navigation:this.navigationActive||this.phase==='stopped'?this.lastNavigation:null,harvest_target:this.harvestTarget?[this.harvestTarget.x,this.harvestTarget.y,this.harvestTarget.z]:null,agent:bot.username,run:state.run,state:this.phase==='complete'?'complete':this.phase==='stopped'?'stopped':'working',phase:this.phase,message:this.error||(resourceProgress+(this.message||this.phase)),logs:reportLogs,blocks:this.built||0,target_blocks:house.total,travelled:this.travelled,health:bot.health,plot:this.plot,milestones:this.milestones,lesson:Math.min(w.lessons?.length||(w.mission==='hut'?1:6),this.milestones.length+1),lesson_total:w.lessons?.length||(w.mission==='hut'?1:6),idle_seconds:stall.idle_seconds,stall_seconds_left:['complete','stopped','night_hold','night_recover'].includes(this.phase)?null:stall.stall_seconds_left,seconds:(Date.now()-this.started)/1000,timings:{...this.timing.snapshot(reportLogs),acquisition_scans:this.scanCount,observed_trees:this.observedTrees,locked_tree:this.tree}});this.lastReport=now;
  }
  return this.error||this.message||this.phase;
 }
 target(bot){
  if(!['gather','quarry','fuel_log','survival_coal','survival_iron','survival_wood'].includes(this.phase)||!this.harvestTarget||bot.health<=0)return null;
  const block=bot.blockAt(this.harvestTarget);
  if(!block||!LOG.test(block.name)&&!['stone','iron_ore','coal_ore'].includes(block.name))return null;
  return {run:this.run,position:[this.harvestTarget.x,this.harvestTarget.y,this.harvestTarget.z],kind:this.harvestKind||'approach',block:block.name};
 }
 milestone(name){if(!this.milestones.includes(name))this.milestones.push(name);}
 requiredWood(bot){
  if(!this.plot)return house.total-1+10;
  const missing=blueprint(this.plot).filter(q=>!matches(bot,q));
  const tableReady=bot.blockAt(house.point(this.plot,'table'))?.name==='crafting_table'||count(bot,n=>n==='crafting_table')>0;
  const doorReady=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-3))?.name.endsWith('_door')||count(bot,n=>n.endsWith('_door'))>0;
  return missing.filter(q=>!q.table).length+(tableReady?0:4)+(doorReady?0:6);
 }
 inside(p,b){return p.x>b[0]+1&&p.x<b[1]-2&&p.z>b[2]+1&&p.z<b[3]-2;}
 async craft(bot,name,count,table){return crafting.craft(bot,name,count,table);}
 async place(bot,q,name){
  this.timing?.mark(this.phase,'building');
  for(let attempt=0;attempt<2;attempt++){
   await inventorySync.sync(bot);
   const item=bot.inventory.items().find(i=>name?i.name===name:planks(i.name));if(!item)throw Error('No building material available.');
   const ref=reference(bot,q);if(!ref)throw Error('No reachable supporting face for placement.');
   await inventorySync.equip(bot,item.name,{synced:true});
   try{await bot.placeBlock(ref.block,ref.face);return;}catch(error){if(attempt||!String(error.message).includes('Server refused'))throw error;await new Promise(r=>setTimeout(r,150));}
  }
 }

 async buildFloor(bot,motor,state,api,scan,tasks){
  const p=bot.entity.position,tiles=blueprint(this.plot).filter(q=>q.floor),remaining=tiles.filter(q=>!matches(bot,q));
  this.built=house.total-blueprint(this.plot).filter(q=>!matches(bot,q)).length;
  if(!remaining.length){motor.pause();this.phase='table';return;}
  const q=remaining.find(q=>!(Math.abs(p.x-q.x-.5)<.85&&Math.abs(p.z-q.z-.5)<.85)&&new Vec3(q.x+.5,q.y+.5,q.z+.5).distanceTo(p.offset(0,1.62,0))<4.2);
  if(!q){
   const goal=remaining[0],stances=tiles.filter(v=>v.x!==goal.x||v.z!==goal.z).filter(v=>standable(bot,v.x,this.plot.y,v.z)).sort((a,b)=>Math.hypot(a.x-goal.x,a.z-goal.z)-Math.hypot(b.x-goal.x,b.z-goal.z));
   const stance=stances[0];if(!stance)throw Error('No safe stance beside the unfinished floor');
   await this.walk(bot,motor,[stance.x+.5,this.plot.y+.1,stance.z+.5],state,api,scan,tasks);return;
  }
  motor.pause();const block=bot.blockAt(new Vec3(q.x,q.y,q.z));
  if(block?.boundingBox!=='empty'){
   if(!block||!['grass_block','dirt','stone','coarse_dirt','rooted_dirt','granite','diorite','andesite'].includes(block.name))throw Error('Floor foundation is obstructed');
   await bot.dig(block);
  }
  await this.place(bot,q,null);this.lastProgress=Date.now();this.message=`Laying wooden floor ${tiles.length-remaining.length+1} / ${tiles.length}`;
 }
 async accessResource(bot,motor,target,state){
  this.resourceAccess=this.resourceAccess||{};
  const result=await resourceAccess.attempt(bot,motor,target,{state:this.resourceAccess,run:state.run,bounds:state.world.bounds,plots:[this.plot,...(this.campPlots||[])]});
  if(result.progress){this.lastProgress=Date.now();this.path=[];this.resourceAt=0;}
  this.message=result.message;return result;
 }
 async workElevated(bot,motor,state,api,scan,tasks){
  const access=this.resourceAccess,[x,z]=access.tree,p=bot.entity.position;
  const entry=access.column.at(-1),center=[entry.position.x+.5,entry.position.y+1.1,entry.position.z+.5];
  if(Math.hypot(p.x-center[0],p.z-center[2])>.15){
   if(await resourceAccess.recoverColumn(bot,motor,access)){this.message='Recentering safely on the temporary harvesting column';return;}
   motor.pause();throw Error('Moved away from the temporary harvesting column: '+JSON.stringify({position:[p.x,p.y,p.z],support:[entry.position.x,entry.position.y,entry.position.z],on_ground:bot.entity.onGround}));
  }
  // Finish with a one-block-at-a-time descent before changing phases or trees.
  const enough=['complete','stopped'].includes(this.phase)||count(bot,n=>LOG.test(n))*4+count(bot,planks)>=(this.supplyRun?28:this.requiredWood(bot));
  const logs=[];for(let y=Math.floor(p.y);y<=Math.floor(p.y)+7;y++){const v=new Vec3(x,y,z);if(LOG.test(bot.blockAt(v)?.name||''))logs.push(v);}
  const target=logs.find(v=>harvestable(bot,v));
  if(!access.descending&&!enough&&bot.health>=10&&target){this.harvestTarget=target;await this.harvest(bot,motor,target,state,api,scan,tasks);return;}
  if(!access.descending&&!enough&&bot.health>=10&&logs.length){const result=await this.accessResource(bot,motor,logs[0],state);if(result.handled)return;}
  access.descending=true;this.message='Dismantling temporary blocks and stepping down safely';
  if(await resourceAccess.descend(bot,motor,access)){this.resourceAccess={};this.tree=null;this.treeApproach=null;this.resourceAt=0;}
  this.lastProgress=Date.now();
 }
 async harvest(bot,motor,target,state,api,scan,tasks,tool=null){
  this.timing.mark(this.phase,'harvesting');
  const p=bot.entity.position,goal=[target.x+.5,p.y,target.z+.5],desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),focusKey=target.toString();
  const pitch=Math.atan2(target.y+.5-p.y-(bot.entity.eyeHeight||1.62),Math.hypot(goal[0]-p.x,goal[2]-p.z));
  if(this.focusBlock!==focusKey||Math.abs(Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw)))>Math.PI/5||Math.abs(bot.entity.pitch-pitch)>Math.PI/5){
   motor.pause();motor.lockLook(true);
   try{await aim(bot,target.offset(.5,.5,.5));this.focusBlock=focusKey;}finally{motor.lockLook(false);}
  }
  const angle=Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw));
  if(!harvestable(bot,target)){const access=await this.accessResource(bot,motor,target,state);if(access.handled)return;this.harvestTarget=null;await level(bot);this.message='Target changed or became obstructed; reacquiring a resource';this.resourceAt=0;return;}
  const task={kind:'gather',goal,bounds:state.world.bounds,coverage_target:100,actual_doors:[],wood_target:16,safe_walk:true,strict_ground:true,avoid_players:true},rays=scan(bot,{goalYaw:desired}),sensed=tasks.observeTask(bot,task,rays,this.runtime);
  sensed.extra[5]=Math.min(1,count(bot,n=>LOG.test(n))/3);
  const obs=[...rays.pooled,Math.sin(angle),Math.cos(angle),Math.min(p.distanceTo(new Vec3(...goal))/32,1),bot.health/20,bot.food/20,bot.entity.onGround?1:0,...sensed.extra];
  this.harvestTarget=target;
  const result=await api('/step',{agent:bot.username,run:state.run,world_skill:'gathering',obs,teacher:5,reward:0,position:[p.x,p.y,p.z],health:bot.health,food:bot.food,hits:rays.hits,perception_ms:0,steps:0,goal,task:'gather',metrics:sensed.metrics});
  this.harvestTarget=target;
  if(result.action===5){
   motor.pause();
   if(space.busy(bot,state.run,target)){this.message='Waiting for another miner to clear the resource';return;}
   space.reserve(bot,state.run,target);this.harvestKind='mining';motor.lockLook(true);
   try{
    const axes=['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe','golden_axe'];
    const chosen=tool||axes.find(n=>bot.inventory.items().some(i=>i.name===n));
    if(chosen&&bot.heldItem?.name!==chosen)await inventorySync.equip(bot,chosen);
    const success=await harvest(bot,bot.blockAt(target));if(success){this.harvested=(this.harvested||0)+1;this.lastProgress=Date.now();this.harvestTarget=null;if(!this.resources?.some(v=>v.x===target.x&&v.z===target.z&&bot.blockAt(v)?.name.endsWith('_log')&&harvestable(bot,v)))await level(bot);}else{this.harvestTarget=null;await level(bot);this.message='Harvest did not remove the block; reacquiring the target';}this.path=[];
   }finally{motor.lockLook(false);}
  }
  else if(this.resourceAccess?.column?.length){motor.pause();this.message='Holding secure footing on the temporary column while the policy selects harvesting';}
  else {this.message=result.action===4?'Policy chose to wait with a visible resource in focus':'Policy is aligning with the selected resource';motor.command(result.action,{...task,quick_look:[0,1,2,3].includes(result.action)},{...sensed,...rays.proximity,cueDistance:p.distanceTo(new Vec3(...goal))},angle);}
 }
 async walk(bot,motor,goal,state,api,scan,tasks,intent={}){
  const p=bot.entity.position,now=Date.now();this.navigationActive=true;
  const portal=this.navigator.portalFor(bot,goal,this.plot,this.campPlots);
  if(portal&&(this.navigator.exitPlot||require('./world_navigation').crossingHome(bot,goal,portal))){
   const door=bot.blockAt(new Vec3(portal.x,portal.y,portal.z-3));
   if(door?.name.endsWith('_door')&&!door.getProperties().open&&p.offset(0,1.62,0).distanceTo(door.position.offset(.5,.5,.5))<4.2){
    motor.pause();await bot.activateBlock(door);this.path=[];this.navigator.lastPlan=-Infinity;this.message='Opening the home door for this route';return;
   }
  }
  if(motor.status?.()?.includes('waiting for reset')&&now-(this.lastRecoveryReset||0)>8000){
   // A transient doorway snag must not leave the local controller permanently
   // blocked after its obstacle has changed. The normal progress deadline stays.
   motor.pause();this.path=[];this.lastPlan=0;this.lastRecoveryReset=now;this.navigator.lastPlan=-Infinity;this.navigator.path=[];
  }
  const planned=this.navigator.plan(bot,goal,{plot:this.plot,plots:this.campPlots,bounds:state.world.bounds,now,memory:this.wilderness?.memory});
  this.lastNavigation={...this.navigator.status,phase:this.phase,position:[p.x,p.y,p.z],yaw:bot.entity.yaw,on_ground:bot.entity.onGround,cue:[...planned.cue],cue_centering:!!planned.cue.centering,motor_before:motor.diagnostic?.(),nearby_players:space.players(bot).filter(q=>q.distanceTo(p)<6).map(q=>[q.x,q.y,q.z]),player_clearance:forBot(bot).player_clearance,sampled_at:now};
  this.path=planned.path;this.lastPlan=this.navigator.lastPlan;this.destination=this.navigator.destination;
  if(this.navigator.replanned)this.timing.replans++;
  if(planned.blocked){motor.pause();this.message=(['return_home','stone_return','light_return','enter'].includes(this.phase)?'Finding a safe way home. ':'')+planned.message;return false;}
  if(planned.arrived){motor.pause();if(Math.hypot(goal[0]-p.x,goal[2]-p.z)<.6&&Math.abs(goal[1]-p.y)<.6)return true;this.message='Approaching the home doorway before continuing';return;}
  const cue=planned.cue;if(!this.inside(new Vec3(...cue),state.world.bounds)){motor.pause();throw Error('Planned route reached the trial boundary.');}
  const passage=routeDoorway(bot,planned.portal,planned.path,goal);
  const skill=this.phase==='enter'?'shelter':'expedition';
  const task={hunting:!!intent.hunting,kind:skill==='gathering'?'gather':skill==='shelter'?'shelter':'expedition',goal,waypoints:[cue],safety_focus:[...cue],bounds:state.world.bounds,actual_doors:[],allow_water:false,coverage_target:100,quick_look:true,safe_walk:true,strict_ground:true,auto_step:true,route_corridor:planned.corridor,avoid_players:true,navigation_lock:state.world.driver==='teacher',center_route:!!cue.centering,travel_sprint:!['floor','table','build','door','enter'].includes(this.phase),sprint_path:planned.path};
  const desired=Math.atan2(-(cue[0]-p.x),-(cue[2]-p.z)),angle=Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw));
  const sensedScan=scan(bot,{goalYaw:desired}),sensed=tasks.observeTask(bot,task,sensedScan,this.runtime);
  const obs=[...sensedScan.pooled,Math.sin(angle),Math.cos(angle),Math.min(p.distanceTo(new Vec3(...goal))/32,1),bot.health/20,bot.food/20,bot.entity.onGround?1:0,...sensed.extra];
  const teacher=tasks.teacherAction(bot,task,sensed,this.runtime,angle);
  const requestAt=Date.now();
  const result=await api('/step',{agent:bot.username,run:state.run,world_skill:skill,obs,teacher,reward:0,position:[p.x,p.y,p.z],health:bot.health,food:bot.food,hits:sensedScan.hits,perception_ms:0,steps:0,goal,task:'expedition',metrics:sensed.metrics});
  this.lastNavigation.rpc_ms=Date.now()-requestAt;
  this.lastNavigation.decision={selected:result.action,teacher,angle};
  const near=sensedScan.proximity;this.lastNavigation.obstacles={wall_ahead:!!near.wallAhead,front_blocked:!!sensed.frontBlocked,head_blocked:!!sensed.headBlocked,ground_clear_035:near.canWalk?.(bot.entity.yaw,.35),ground_clear_075:near.canWalk?.(bot.entity.yaw,.75)};
  this.timing.action(result.action);this.timing.mark(this.phase,this.collecting?'collecting':result.action===1||result.action===2?'aligning':'navigating');
  const motorLabel=motor.command(result.action,task,{...sensed,...sensedScan.proximity,doorway:passage,focusPoint:cue,cueDistance:Math.hypot(cue[0]-p.x,cue[2]-p.z)},angle);this.lastNavigation.motor_after=motor.diagnostic?.();if(motorLabel)this.message=motorLabel;
 }
}
module.exports={HutTeacher,blueprint,intact,findPlot,findSpawn,surface,reference};

// Scripted hut teacher composes real harvesting, crafting and block placement.
// Only the movement decisions can be student-controlled in this first version.
const {Vec3}=require('vec3');
const crafting=require('./crafting');
const inventorySync=require('./inventory_sync');
const {harvest}=require('./harvest');
const {route,standable}=require('./field_navigation');
const {WorldTiming,treeFocus}=require('./world_timing');
const settlement=require('./settlement');
const {scanTrees,visibleBlock}=require('./target_scan');
const {doorwayDescriptor}=require('./doorway');
const furnace=require('./furnace');
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
function findSpawn(bot,bounds){
 const cx=Math.floor((bounds[0]+bounds[1])/2),cz=Math.floor((bounds[2]+bounds[3])/2);let best=null,score=-Infinity;
 for(let dx=-24;dx<=24;dx+=3)for(let dz=-24;dz<=24;dz+=3){const x=cx+dx,z=cz+dz,y=surface(bot,x,z);if(y===null)continue;
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
  let flat=true;for(let a=-2;a<=2&&flat;a++)for(let b=-2;b<=2;b++)if(height(x+a,z+b)!==y){flat=false;break;}
  if(flat){const tableY=height(x-3,z+3);if(tableY!==null&&Math.abs(tableY-y)<3)return {x,y,z,tableY};}
 }return null;
}
function blueprint(plot){
 const {x,y,z}=plot,blocks=[];
 for(let dy=0;dy<2;dy++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)
  if((Math.abs(dx)===2||Math.abs(dz)===2)&&!(dx===0&&dz===-2))blocks.push({x:x+dx,y:y+dy,z:z+dz,table:dy===0&&dx===-2&&dz===1});
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)blocks.push({x:x+dx,y:y+2,z:z+dz});
 return blocks;
}
function matches(bot,p){const name=bot.blockAt(new Vec3(p.x,p.y,p.z))?.name||'';return p.table?name==='crafting_table':planks(name);}
function intact(bot,plot){return blueprint(plot).every(p=>matches(bot,p));}
function reference(bot,p){for(const [dx,dy,dz] of [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]){
 const b=bot.blockAt(new Vec3(p.x+dx,p.y+dy,p.z+dz));if(b&&b.boundingBox==='block'&&!['crafting_table','chest','barrel'].includes(b.name)&&!b.name.endsWith('_door'))return {block:b,face:new Vec3(-dx,-dy,-dz)};
}return null;}
class HutTeacher{
 constructor(){this.run=null;}
 async tick(bot,motor,state,api,scan,tasks){
  const now=Date.now(),p=bot.entity.position,w=state.world;
  if(this.run!==state.run){this.run=state.run;this.phase='survey';this.started=now;this.lastReport=0;this.travelled=0;this.last=p.clone();this.path=[];this.lastPlan=0;this.lastProgress=now;this.anchor=p.clone();this.runtime=tasks.createRuntime();this.harvested=0;this.error=null;this.spawned=false;this.ignoredTrees=new Map();this.ignoredDrops=new Map();this.resourceAt=0;this.grove=null;this.inventoryAt=0;this.plot=null;this.table=null;this.built=0;this.secureAt=null;this.settle=0;this.resources=[];this.destination=null;this.tree=null;this.treeApproach=null;this.pickup=null;this.timing=new WorldTiming(now);this.milestones=[];this.supplyRun=false;this.collecting=false;this.scanCount=0;this.observedTrees=0;this.quarry=null;this.lastRecoveryReset=0;console.log(JSON.stringify({event:'world_controller',agent:bot.username,gameMode:bot.game.gameMode}));}
  this.timing.mark(this.phase,'waiting',now);
  const moved=Math.hypot(p.x-this.last.x,p.z-this.last.z);if(moved<4&&this.phase!=='survey')this.travelled+=moved;this.last=p.clone();
  if(Math.hypot(p.x-this.anchor.x,p.z-this.anchor.z)>1){this.anchor=p.clone();this.lastProgress=now;}
  this.message='';
  if(this.phase!=='survey'&&!this.inside(p,w.bounds)){this.error='Reached the simulation boundary; stopped.';this.phase='stopped';}
  if(this.phase!=='survey'&&now>this.settle&&(bot.health<10||bot.food<5)){this.error='Health or food too low to continue safely.';this.phase='stopped';}
  if(now-this.started>1150000){this.error='Trial time limit reached.';this.phase='stopped';}
  try{
   if(this.phase==='survey'&&now-this.started<4000){motor.pause();this.message='Waiting for natural terrain chunks';}
   else if(this.phase==='survey'){
    motor.pause();const cx=Math.floor((w.bounds[0]+w.bounds[1])/2),cz=Math.floor((w.bounds[2]+w.bounds[3])/2);
    const spawn=w.prepared&&w.camp_anchor&&standable(bot,...w.camp_anchor)?[w.camp_anchor[0]+.5,w.camp_anchor[1]+.1,w.camp_anchor[2]+.5]:findSpawn(bot,w.bounds);
    if(!spawn){this.message='Surveying loaded terrain for a safe shared spawn';if(now-this.started>30000)throw Error('No safe natural spawn found. Try another site.');}
    else{let destination=spawn;if(w.prepared){const camp=await api('/world/camp',{agent:bot.username,position:spawn});this.plot=camp.plots[w.index];this.grove=camp.groves[w.index];destination=camp.spawn;}else{this.plot=findPlot(bot,w.bounds,w.index,w.spread,w.count||8);if(!this.plot)throw Error('No flat 5 × 5 build site in this bot’s sector. Try another natural scenario.');}await api('/world/spawn',{agent:bot.username,position:destination});this.phase='gather';this.settle=now+1500;}
   }else if(now<this.settle){motor.pause();this.message='Settling on natural ground';}
   else if(this.phase==='gather'){
    for(const [id,until] of this.ignoredTrees)if(now>until)this.ignoredTrees.delete(id);
    for(const [id,until] of this.ignoredDrops)if(now>until)this.ignoredDrops.delete(id);
    if(now-this.inventoryAt>1500){await inventorySync.sync(bot);this.inventoryAt=now;}
    if(count(bot,n=>LOG.test(n))*4+count(bot,planks)>=(this.supplyRun?28:this.requiredWood(bot))){motor.pause();this.phase=this.supplyRun?'supply_craft':'craft';}
    else{
     if(!this.resourceAt||now-this.resourceAt>1500){this.resources=this.grove?this.grove.flatMap(([x,y,z])=>[0,1,2,3].map(dy=>new Vec3(x,y+dy,z))):bot.findBlocks({matching:b=>LOG.test(b.name),useExtraInfo:b=>Math.abs(b.position.y-p.y)<5,maxDistance:64,count:256}).filter(v=>this.inside(v,w.bounds)&&safeResource(bot,v));this.resourceAt=now;}
     if(this.grove&&!this.resources.some(v=>LOG.test(bot.blockAt(v)?.name||''))){this.grove=null;this.resourceAt=0;}
     let targets=this.resources.filter(v=>!this.ignoredTrees.has(v.x+','+v.z)&&LOG.test(bot.blockAt(v)?.name||'')).sort((a,b)=>a.distanceTo(p)-b.distanceTo(p));
     if(!this.tree||!targets.some(v=>v.x+','+v.z===this.tree)){
      const observed=scanTrees(bot),visible=new Set(observed.map(v=>v.x+','+v.z));this.scanCount++;this.observedTrees=visible.size;
      const visibleTargets=targets.filter(v=>visible.has(v.x+','+v.z));if(visibleTargets.length)targets=[...visibleTargets,...targets.filter(v=>!visible.has(v.x+','+v.z))];
     }
     const focused=treeFocus(targets,this.tree);
     if(focused.key!==this.tree){if(this.tree)this.timing.targets++;this.tree=focused.key;this.treeApproach=null;this.path=[];}
     targets=focused.targets;
     const drops=Object.values(bot.entities).filter(e=>e.name==='item'&&woodDrop(bot,e)&&Math.abs(e.position.y-p.y)<1.7&&e.position.distanceTo(p)<6&&(!this.ignoredDrops?.has(e.id))).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p));
     const drop=drops.find(e=>e.id===this.pickup)||drops[0];this.pickup=drop?.id??null;
     const collecting=drop&&Math.hypot(drop.position.x-p.x,drop.position.z-p.z)>1;
     let target=collecting?null:targets.find(v=>v.distanceTo(p)<3.6&&Math.hypot(v.x+.5-p.x,v.z+.5-p.z)<1.9&&visibleBlock(bot,bot.blockAt(v))&&bot.canDigBlock(bot.blockAt(v)));
     if(collecting){this.collecting=true;const moved=await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);this.collecting=false;if(moved===false){this.ignoredDrops.set(drop.id,now+5000);this.pickup=null;}this.message='Collecting harvested drops';}
     else if(target){await this.harvest(bot,motor,target,state,api,scan,tasks);}
     else if(targets.length){let destination=this.treeApproach,chosenTree=targets[0];
      if(destination&&!standable(bot,Math.floor(destination[0]),Math.round(destination[1]),Math.floor(destination[2])))destination=null;
      if(!destination){const approaches=[];for(const block of targets)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const y=surface(bot,block.x+dx,block.z+dz);if(y!==null&&block.y-y<3.2&&block.y-y>-.5)approaches.push([block.x+dx+.5,y+.1,block.z+dz+.5]);}
       approaches.sort((a,b)=>Math.hypot(a[0]-p.x,a[2]-p.z)-Math.hypot(b[0]-p.x,b[2]-p.z));destination=approaches[0];this.treeApproach=destination||null;}

      if(destination){const moved=await this.walk(bot,motor,destination,state,api,scan,tasks);if(moved===false&&chosenTree&&bot.entity.onGround){this.ignoredTrees.set(chosenTree.x+','+chosenTree.z,now+5000);this.treeApproach=null;}this.message=this.message||'Approaching selected tree';}else{motor.pause();this.message='Tree has no safe approach';this.resourceAt=0;
       const leaf=bot.findBlocks({matching:b=>b.name.endsWith('_leaves'),maxDistance:4,count:24}).filter(v=>this.inside(v,w.bounds)&&v.y>=p.y&&v.y<p.y+2.5).map(v=>bot.blockAt(v)).find(block=>block&&visibleBlock(bot,block)&&bot.canDigBlock(block));
       if(leaf){this.message='Clearing foliage to reach a tree';await bot.dig(leaf);this.ignoredTrees.clear();this.lastProgress=Date.now();}
      }}
     else{motor.pause();this.message='Retrying reachable resources after a blocked approach';this.resourceAt=0;}
     this.message=this.message||`Harvesting logs ${count(bot,n=>LOG.test(n))} / 16`;
    }
   }else if(this.phase==='craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();for(const item of [...bot.inventory.items()].filter(i=>LOG.test(i.name))){const name=item.name.replace('_log','_planks'),id=bot.registry.itemsByName[name]?.id;const recipe=id&&bot.recipesFor(id,null,1,null)[0];if(recipe)await crafting.craft(bot,name,item.count,null);}
    this.table={x:this.plot.x-2,y:this.plot.y,z:this.plot.z+1};
    if(bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z))?.name!=='crafting_table'&&!count(bot,n=>n==='crafting_table'))await this.craft(bot,'crafting_table',1,null);
    this.phase='table';
   }else if(this.phase==='table'){
    if(bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z))?.name==='crafting_table'){this.phase='door_craft';motor.pause();}
    else if(p.distanceTo(new Vec3(this.table.x,this.table.y,this.table.z))>3.5)await this.walk(bot,motor,[this.table.x+1.5,this.table.y+.1,this.table.z+.5],state,api,scan,tasks);
    else{motor.pause();await this.place(bot,this.table,'crafting_table');this.phase='door_craft';}
   }else if(this.phase==='door_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();const table=bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z));
    if(!count(bot,n=>n.endsWith('_door'))&&!bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2))?.name.endsWith('_door')){
    const totals=new Map();for(const item of bot.inventory.items())if(planks(item.name))totals.set(item.name,(totals.get(item.name)||0)+item.count);
    const wood=bot.inventory.items().filter(i=>planks(i.name)&&totals.get(i.name)>=6).sort((a,b)=>totals.get(b.name)-totals.get(a.name))[0];if(!wood)throw Error('No planks available after crafting.');
    await this.craft(bot,wood.name.replace('_planks','_door'),1,table);
    }this.phase='build';
   }else if(this.phase==='build'){
    if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)>.45||Math.abs(p.y-this.plot.y)>.3){await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);this.message='Taking position inside the hut';}
    else{
    const remaining=blueprint(this.plot).filter(q=>!matches(bot,q));
    this.built=55-remaining.length;
    if(!remaining.length){this.phase='door';motor.pause();}
    else{
     const q=remaining.find(q=>new Vec3(q.x+.5,q.y+.5,q.z+.5).distanceTo(p)<4.2&&reference(bot,q));
     if(q){motor.pause();const occupied=bot.blockAt(new Vec3(q.x,q.y,q.z));if(occupied?.name.endsWith('_leaves')&&bot.canDigBlock(occupied)){await bot.dig(occupied);return 'Clearing leaves from hut footprint';}if(!occupied||occupied.boundingBox!=='empty')throw Error('Build plot was obstructed; stopped without clearing terrain.');await this.place(bot,q,null);this.lastProgress=Date.now();}
     else await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
     this.message=`Placing hut blocks ${this.built} / 55`;
    }
    }
   }else if(this.phase==='door'){
    const door={x:this.plot.x,y:this.plot.y,z:this.plot.z-2};
    if(bot.blockAt(new Vec3(door.x,door.y,door.z))?.name.endsWith('_door')){this.phase='enter';motor.pause();}
    else if(p.distanceTo(new Vec3(door.x,door.y,door.z))>3.5)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
    else{motor.pause();const item=bot.inventory.items().find(i=>i.name.endsWith('_door'));if(!item)throw Error('Crafted door missing.');await bot.look(Math.PI,0,true);await this.place(bot,door,item.name);this.phase='enter';}
   }else if(this.phase==='enter'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(!door?.name.endsWith('_door'))throw Error('Door placement did not create a usable entrance.');
    if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)<.8){motor.pause();if(door.getProperties().open)await bot.activateBlock(door);this.secureAt=now;this.phase='shelter';}
    else{if(!door.getProperties().open&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}else await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);}
   }else if(this.phase==='shelter'){
    motor.pause();const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(!intact(bot,this.plot)||!door?.name.endsWith('_door')||door.getProperties().open)throw Error('Hut enclosure failed final verification.');
    if(now-this.secureAt>=3000){this.milestone('hut');this.phase=w.mission!=='hut'?'leave_hut':'complete';this.message='Hut verified. '+(w.mission!=='hut'?'Next: gather supplies for a chest and tools.':'Built an intact enclosed hut, closed the door and sheltered for 3 seconds.');}
   }else if(this.phase==='leave_hut'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(door?.name.endsWith('_door')&&!door.getProperties().open){motor.pause();await bot.activateBlock(door);}
    else if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z+3.5)>.6)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z-3.5],state,api,scan,tasks);
    else{motor.pause();this.supplyRun=true;this.grove=w.prepared?(await api('/world/resources',{agent:bot.username})).trees:null;this.resources=[];this.resourceAt=0;this.tree=null;this.treeApproach=null;this.pickup=null;this.ignoredTrees.clear();this.ignoredDrops.clear();this.phase='gather';this.lastProgress=now;this.message='Lesson resources ready: harvest extra wood for chest, tools and stored supplies';}
   }else if(this.phase==='supply_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();
    for(const item of [...bot.inventory.items()].filter(i=>LOG.test(i.name)))await this.craft(bot,item.name.replace('_log','_planks'),item.count,null);
    this.phase='return_home';this.lastProgress=Date.now();
   }else if(this.phase==='return_home'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(door?.name.endsWith('_door')&&!door.getProperties().open&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}
    else if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)>.45)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
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
    else this.phase='stock_chest';
   }else if(this.phase==='stock_chest'){
    this.timing.mark(this.phase,'stocking');motor.pause();const stored=await settlement.stockChest(bot,bot.blockAt(settlement.chestPosition(this.plot)),8);
    await inventorySync.equip(bot,'wooden_axe');
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));if(door?.getProperties().open)await bot.activateBlock(door);
    if(!intact(bot,this.plot)||!settlement.TOOLS.every(name=>count(bot,n=>n===name)>0)||stored<8)throw Error('Settlement final verification failed');
    this.milestone('stocked');this.phase=w.mission==='stone_age'?'quarry_setup':'complete';this.message=w.mission==='stone_age'?'Settlement verified. Next: mine stone, upgrade tools, build a furnace and make lighting.':'Settlement complete: enclosed hut, chest with 8 planks, pickaxe, axe and shovel; axe equipped.';
   }else if(this.phase==='quarry_setup'){
    motor.pause();this.quarry=await api('/world/quarry',{agent:bot.username});this.phase='quarry_exit';this.lastProgress=now;
   }else if(this.phase==='quarry_exit'||this.phase==='light_exit'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(door&&!door.getProperties().open){motor.pause();await bot.activateBlock(door);}
    else if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z+3.5)>.6)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z-3.5],state,api,scan,tasks);
    else{motor.pause();this.phase=this.phase==='quarry_exit'?'quarry':'light_place';this.lastProgress=now;}
   }else if(this.phase==='quarry'){
    const cobble=count(bot,n=>n==='cobblestone');this.message=`Mining stone ${cobble} / 16`;
    if(cobble>=16){this.milestone('quarry');this.phase='fuel_log';motor.pause();}
    else{
     const blocks=this.quarry.blocks.map(v=>bot.blockAt(new Vec3(...v))).filter(b=>b?.name==='stone').sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p));
     const drop=Object.values(bot.entities).filter(e=>e.name==='item'&&woodDrop(bot,e,n=>n==='cobblestone')&&Math.abs(e.position.y-p.y)<1.7&&e.position.distanceTo(p)<7).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p))[0];
     const target=blocks.find(b=>b.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&visibleBlock(bot,b)&&bot.canDigBlock(b));
     if(drop&&Math.hypot(drop.position.x-p.x,drop.position.z-p.z)>1)await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);
     else if(target)await this.harvest(bot,motor,target.position,state,api,scan,tasks,'wooden_pickaxe');
     else if(blocks.length)await this.walk(bot,motor,this.quarry.approach,state,api,scan,tasks);
     else if(cobble>=14){this.milestone('quarry');this.phase='fuel_log';motor.pause();}
     else motor.pause();
    }
   }else if(this.phase==='fuel_log'){
    if(count(bot,n=>LOG.test(n))>=2){motor.pause();this.phase='stone_return';}
    else{
     const drop=Object.values(bot.entities).find(e=>e.name==='item'&&woodDrop(bot,e)&&e.position.distanceTo(p)<7);
     const block=this.quarry.fuel.map(v=>bot.blockAt(new Vec3(...v))).filter(b=>b&&LOG.test(b.name)).sort((a,b)=>a.position.distanceTo(p)-b.position.distanceTo(p))[0];
     if(drop)await this.walk(bot,motor,[drop.position.x,p.y,drop.position.z],state,api,scan,tasks);
     else if(block&&block.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&visibleBlock(bot,block))await this.harvest(bot,motor,block.position,state,api,scan,tasks,'wooden_axe');
     else if(block)await this.walk(bot,motor,[block.position.x-1.5,this.plot.y+.1,block.position.z+.5],state,api,scan,tasks);
    }
   }else if(this.phase==='stone_return'||this.phase==='light_return'){
    const door=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2));
    if(door&&!door.getProperties().open&&door.position.distanceTo(p)<3.5){motor.pause();await bot.activateBlock(door);}
    else if(Math.hypot(p.x-this.plot.x-.5,p.z-this.plot.z-.5)>.45)await this.walk(bot,motor,[this.plot.x+.5,this.plot.y+.1,this.plot.z+.5],state,api,scan,tasks);
    else{motor.pause();if(this.phase==='stone_return')this.phase='stone_tools';else{if(door.getProperties().open)await bot.activateBlock(door);this.phase='complete';this.message='Stone-age base complete: stocked hut, wooden and stone tools, working furnace, charcoal and exterior torch.';}this.lastProgress=now;}
   }else if(this.phase==='stone_tools'){
    this.timing.mark(this.phase,'crafting');motor.pause();const table=bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z));
    const tool=['stone_pickaxe','stone_axe'].find(name=>!count(bot,n=>n===name));
    // Keep one raw log for charcoal; the second supplies handles and furnace fuel.
    if(tool==='stone_pickaxe'&&count(bot,planks)<3){const log=bot.inventory.items().find(i=>LOG.test(i.name));if(count(bot,n=>LOG.test(n))<2)throw Error('Reserve a charcoal log before making tool supplies');await this.craft(bot,log.name.replace('_log','_planks'),1,null);}
    if(tool){if(count(bot,n=>n==='stick')<2)await this.craft(bot,'stick',1,null);await this.craft(bot,tool,1,table);this.milestone(tool);this.lastProgress=Date.now();}
    else this.phase='furnace';
   }else if(this.phase==='furnace'){
    this.timing.mark(this.phase,'crafting');motor.pause();const pos=new Vec3(this.plot.x-1,this.plot.y,this.plot.z+1);
    if(bot.blockAt(pos)?.name!=='furnace'){if(!count(bot,n=>n==='furnace'))await this.craft(bot,'furnace',1,bot.blockAt(new Vec3(this.table.x,this.table.y,this.table.z)));await this.place(bot,pos,'furnace');}
    this.milestone('furnace');this.phase='smelt';this.lastProgress=Date.now();
   }else if(this.phase==='smelt'){
    this.timing.mark(this.phase,'smelting');motor.pause();if(!count(bot,n=>n==='charcoal'))await furnace.charcoal(bot,bot.blockAt(new Vec3(this.plot.x-1,this.plot.y,this.plot.z+1)));
    await inventorySync.sync(bot);if(!count(bot,n=>n==='charcoal'))throw Error('Charcoal was not received from the furnace');this.milestone('charcoal');this.phase='torch_craft';this.lastProgress=Date.now();
   }else if(this.phase==='torch_craft'){
    this.timing.mark(this.phase,'crafting');motor.pause();if(!count(bot,n=>n==='torch')){if(count(bot,n=>n==='stick')<1)await this.craft(bot,'stick',1,null);await this.craft(bot,'torch',1,null);}this.phase='light_exit';
   }else if(this.phase==='light_place'){
    motor.pause();const pos=new Vec3(this.plot.x-1,this.plot.y,this.plot.z-3);
    if(bot.blockAt(pos)?.name!=='torch')await this.place(bot,pos,'torch');
    if(bot.blockAt(pos)?.name!=='torch')throw Error('Exterior torch placement did not verify');this.milestone('torch');await inventorySync.equip(bot,'stone_axe');this.phase='light_return';this.lastProgress=Date.now();
   }else motor.pause();
   if(!['survey','gather','craft','door_craft','supply_craft','chest','tools','stock_chest','quarry','fuel_log','stone_tools','furnace','smelt','torch_craft','shelter','complete','stopped'].includes(this.phase)&&now-this.lastProgress>60000)throw Error('No construction or movement progress for 60 seconds.');
  }catch(error){motor.pause();this.error=this.phase+': '+error.message;this.phase='stopped';}
  if(now-this.lastReport>1000||['complete','stopped'].includes(this.phase)){
   const reportLogs=this.phase==='survey'||Date.now()<this.settle?0:count(bot,n=>LOG.test(n));
   const resourceProgress=this.phase==='quarry'?`Cobblestone ${count(bot,n=>n==='cobblestone')} / 16 · `:this.phase==='fuel_log'?`Fuel logs ${reportLogs} / 2 · `:'';
   await api('/world/report',{agent:bot.username,run:state.run,state:this.phase==='complete'?'complete':this.phase==='stopped'?'stopped':'working',phase:this.phase,message:this.error||(resourceProgress+(this.message||this.phase)),logs:reportLogs,blocks:this.built||0,target_blocks:55,travelled:this.travelled,health:bot.health,plot:this.plot,milestones:this.milestones,lesson:Math.min(w.lessons?.length||(w.mission==='hut'?1:6),this.milestones.length+1),lesson_total:w.lessons?.length||(w.mission==='hut'?1:6),seconds:(Date.now()-this.started)/1000,timings:{...this.timing.snapshot(reportLogs),acquisition_scans:this.scanCount,observed_trees:this.observedTrees,locked_tree:this.tree}});this.lastReport=now;
  }
  return this.error||this.message||this.phase;
 }
 milestone(name){if(!this.milestones.includes(name))this.milestones.push(name);}
 requiredWood(bot){
  if(!this.plot)return 64;
  const missing=blueprint(this.plot).filter(q=>!matches(bot,q));
  const tableReady=bot.blockAt(new Vec3(this.plot.x-2,this.plot.y,this.plot.z+1))?.name==='crafting_table'||count(bot,n=>n==='crafting_table')>0;
  const doorReady=bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2))?.name.endsWith('_door')||count(bot,n=>n.endsWith('_door'))>0;
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
   await inventorySync.equip(bot,item.name);
   try{await bot.placeBlock(ref.block,ref.face);return;}catch(error){if(attempt||!String(error.message).includes('Server refused'))throw error;await new Promise(r=>setTimeout(r,150));}
  }
 }

 async harvest(bot,motor,target,state,api,scan,tasks,tool=null){
  this.timing.mark(this.phase,'harvesting');
  const p=bot.entity.position,goal=[target.x+.5,p.y,target.z+.5],desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),angle=Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw));
  const task={kind:'gather',goal,bounds:state.world.bounds,coverage_target:100,actual_doors:[],wood_target:16},rays=scan(bot,{goalYaw:desired}),sensed=tasks.observeTask(bot,task,rays,this.runtime);
  sensed.extra[5]=Math.min(1,count(bot,n=>LOG.test(n))/3);
  const obs=[...rays.pooled,Math.sin(angle),Math.cos(angle),Math.min(p.distanceTo(new Vec3(...goal))/32,1),bot.health/20,bot.food/20,bot.entity.onGround?1:0,...sensed.extra];
  const result=await api('/step',{agent:bot.username,run:state.run,world_skill:'gathering',obs,teacher:5,reward:0,position:[p.x,p.y,p.z],health:bot.health,food:bot.food,hits:rays.hits,perception_ms:0,steps:0,goal,task:'gather',metrics:sensed.metrics});
  if(result.action===5){motor.pause();await inventorySync.sync(bot);if(tool)await inventorySync.equip(bot,tool);else{const empty=Array.from({length:9},(_,i)=>i).find(i=>!bot.inventory.slots[36+i]);if(empty!==undefined)bot.setQuickBarSlot(empty);}await new Promise(r=>setTimeout(r,100));const success=await harvest(bot,bot.blockAt(target));if(success)this.lastProgress=Date.now();this.path=[];}
  else motor.command(result.action,task,{...sensed,...rays.proximity,cueDistance:p.distanceTo(new Vec3(...goal))},angle);
 }
 async walk(bot,motor,goal,state,api,scan,tasks){
  const p=bot.entity.position,now=Date.now();
  if(motor.status?.()?.includes('waiting for reset')&&now-(this.lastRecoveryReset||0)>8000){
   // A transient doorway snag must not leave the local controller permanently
   // blocked after its obstacle has changed. The normal progress deadline stays.
   motor.pause();this.path=[];this.lastPlan=0;this.lastRecoveryReset=now;
  }
  const passage=this.plot?doorwayDescriptor(bot,bot.blockAt(new Vec3(this.plot.x,this.plot.y,this.plot.z-2)),goal):null;
  while(this.path.length&&Math.hypot(this.path[0][0]-p.x,this.path[0][2]-p.z)<.55&&Math.abs(this.path[0][1]-p.y)<.8)this.path.shift();
  const dest=goal.join(',');if(!this.path.length||this.destination!==dest||now-this.lastPlan>2500){const planned=route(bot,goal);this.timing.replans++;this.path=planned.path;this.destination=dest;this.lastPlan=now;if(!this.path.length){if(passage||motor.passageActive?.())this.path=[goal];else{motor.pause();this.message=planned.message;return false;}}}
  const cue=this.path[0];if(!this.inside(new Vec3(...cue),state.world.bounds)){motor.pause();throw Error('Planned route reached the trial boundary.');}
  const skill=this.phase==='enter'?'shelter':'expedition';
  const task={kind:skill==='gathering'?'gather':skill==='shelter'?'shelter':'expedition',goal,waypoints:[cue],bounds:state.world.bounds,actual_doors:[],allow_water:false,coverage_target:100,quick_look:true,navigation_lock:state.world.driver==='teacher'};
  const desired=Math.atan2(-(cue[0]-p.x),-(cue[2]-p.z)),angle=Math.atan2(Math.sin(desired-bot.entity.yaw),Math.cos(desired-bot.entity.yaw));
  const sensedScan=scan(bot,{goalYaw:desired}),sensed=tasks.observeTask(bot,task,sensedScan,this.runtime);
  const obs=[...sensedScan.pooled,Math.sin(angle),Math.cos(angle),Math.min(p.distanceTo(new Vec3(...goal))/32,1),bot.health/20,bot.food/20,bot.entity.onGround?1:0,...sensed.extra];
  const teacher=tasks.teacherAction(bot,task,sensed,this.runtime,angle);
  const result=await api('/step',{agent:bot.username,run:state.run,world_skill:skill,obs,teacher,reward:0,position:[p.x,p.y,p.z],health:bot.health,food:bot.food,hits:sensedScan.hits,perception_ms:0,steps:0,goal,task:'expedition',metrics:sensed.metrics});
  this.timing.action(result.action);this.timing.mark(this.phase,this.collecting?'collecting':result.action===1||result.action===2?'aligning':'navigating');
  const motorLabel=motor.command(result.action,task,{...sensed,...sensedScan.proximity,doorway:passage,focusPoint:cue,cueDistance:Math.hypot(cue[0]-p.x,cue[2]-p.z)},angle);if(motorLabel)this.message=motorLabel;
 }
}
module.exports={HutTeacher,blueprint,intact,findPlot,findSpawn,surface,reference};

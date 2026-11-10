// Recover an already-earned home with real inventory, recipes and placements.
const {Vec3}=require('vec3'),house=require('./house'),nav=require('./field_navigation'),space=require('./resource_space');
const inventory=require('./inventory_sync'),placement=require('./placement_reference'),access=require('./resource_access');
const terrain=require('./home_terrain');
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
const empty=b=>!!b&&['air','cave_air','void_air','light'].includes(b.name)&&b.boundingBox==='empty';
const count=(b,p)=>b.inventory.items().filter(i=>typeof p==='string'?i.name===p:p(i.name)).reduce((s,i)=>s+i.count,0);
function matches(b,q){
 const v=b.blockAt(new Vec3(q.x,q.y,q.z));if(!v)return null;
 if(q.kind==='foundation')return terrain.solid(v);
 if(q.kind==='planks')return v.name.endsWith('_planks');
 if(q.kind==='door')return v.name.endsWith('_door')&&b.blockAt(new Vec3(q.x,q.y+1,q.z))?.name===v.name&&v.getProperties?.().half==='lower';
 if(q.kind==='bed')return v.name.endsWith('_bed')&&v.getProperties?.().part==='foot'&&b.blockAt(new Vec3(q.x,q.y,q.z+1))?.name===v.name&&b.blockAt(new Vec3(q.x,q.y,q.z+1))?.getProperties?.().part==='head';
 if(q.kind==='torch')return require('./house_lighting').installed(b,q.plot,q.side);
 return v.name===q.kind;
}
function expected(t,b){
 const h=t.plot,all=[];
 // Entrance craters can strand a returning bot while every house block is intact.
 if(b&&(t.homeRepair||t.homeDamage?.unsafe||terrain.entranceDrop(t,b)))all.push(...terrain.plan(t,b));
 const partial=!t.milestones.includes('hut');
 all.push(...house.blueprint(h).filter(q=>!partial||q.floor||q.table).map(q=>({...q,kind:q.table?'crafting_table':'planks',structural:true})));
 if(!partial)all.push({x:h.x,y:h.y,z:h.z-3,kind:'door',structural:true});
 for(const [milestone,key,kind] of [['chest','chest','chest'],['furnace','furnace','furnace'],['bed_home','bed','bed']])if(t.milestones.includes(milestone)){const p=house.point(h,key);all.push({x:p.x,y:p.y,z:p.z,kind});}
 if(t.milestones.includes('torch'))for(const side of ['indoor','outdoor']){const p=house.torchMount(h,side).position;all.push({x:p.x,y:p.y,z:p.z,kind:'torch',plot:h,side});}
 return all;
}
function inspect(t,b){
 if(!t.plot||!t.milestones.includes('hut')&&!t.milestones.includes('furnace'))return null;
 const all=expected(t,b),missing=[],unknown=[];
 for(const q of all){const ok=matches(b,q);if(ok===null)unknown.push(q);else if(!ok)missing.push(q);}
 return {missing,unknown,unsafe:missing.some(q=>q.structural),checked_at:Date.now()};
}
function observe(t,b){
 if(!t.plot||!t.milestones.includes('hut')&&!t.milestones.includes('furnace')||Date.now()<(t.homeInspectAt||0))return;
 t.homeInspectAt=Date.now()+2000;
 if(Math.hypot(b.entity.position.x-t.plot.x,b.entity.position.z-t.plot.z)>32)return;
 const damage=inspect(t,b);if(damage&&!damage.unknown.length)t.homeDamage=damage;
}
function needsWood(r,b){return count(b,n=>n.endsWith('_planks'))+Math.max(0,count(b,n=>LOG.test(n))-r.rawLogs)*4<r.woodNeeded||count(b,n=>LOG.test(n))<r.rawLogs;}
function budget(missing,b,restock=false){
 const cost={planks:1,foundation:1,crafting_table:4,door:6,chest:8,bed:3};
 const carried=q=>q.kind==='door'?count(b,n=>n.endsWith('_door')):q.kind==='bed'?count(b,n=>n.endsWith('_bed')):count(b,q.kind);
 const reserve=missing.some(q=>q.kind==='furnace')?8:0;
 const fill=missing.filter(q=>q.kind==='foundation').length;
 const wood=missing.reduce((s,q)=>s+(q.kind!=='planks'&&q.kind!=='foundation'&&carried(q)?0:cost[q.kind]||0),0)-Math.min(fill,terrain.available(b,reserve))+(restock?8:0);
 const torches=missing.filter(q=>q.kind==='torch').length>count(b,'torch'),needsFuel=torches&&!count(b,n=>n==='coal'||n==='charcoal');
 return {woodNeeded:wood+(torches&&!count(b,'stick')?2:0)+(needsFuel?2:0),rawLogs:needsFuel?1:0};
}
function begin(t,damage){
 const r=t.homeRepair={resume:t.phase,stage:'repair',repaired:0,supplyRun:t.supplyRun,fuelTrip:t.wilderness?.fuelTrip,survivalResume:t.wilderness?.resume};
 t.phase='home_repair';t.path=[];t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();return r;
}
function collecting(t){return t.homeRepair?.stage==='wood'&&t.phase==='gather';}
function report(t){const r=t.homeRepair;return r?{stage:r.stage,remaining:t.homeDamage?.missing.length??null,repaired:r.repaired,message:r.message||null}:null;}
async function salvage(t,b,motor,state,api,scan,tasks){
 const r=t.homeRepair,now=Date.now();r.ignoredDrops??=new Map();
 const drop=Object.values(b.entities||{}).find(e=>e.name==='item'&&e.isValid!==false&&e.position&&Math.abs(e.position.x-t.plot.x)<4&&Math.abs(e.position.z-t.plot.z)<4&&Math.abs(e.position.y-t.plot.y)<4&&now>(r.ignoredDrops.get(e.id)||0)&&space.clearOfPlayers(b,e.position,2)&&/(_planks|_log|_pickaxe|_axe|_shovel|_bed|_door|_wool|^chest$|^furnace$|^crafting_table$|^torch$|^coal$|^charcoal$|^raw_iron$|^iron_ingot$)/.test(require('./survival').itemName(b,e)||''));
 if(!drop)return false;
 if(r.dropId!==drop.id){r.dropId=drop.id;r.dropAt=now;}
 if(now-r.dropAt>5000){r.ignoredDrops.set(drop.id,now+30000);return false;}
 const q=drop.position.floored(),g=[q.x+.5,q.y+.1,q.z+.5];
 if(!nav.standable(b,q.x,q.y,q.z)||!nav.route(b,g,24,2048,true,{bounds:state.world.bounds,reversible:true}).reached){r.ignoredDrops.set(drop.id,now+30000);return false;}
 if(b.entity.position.distanceTo(drop.position)<1.2){motor.pause();if(now-(r.dropSyncAt||0)>1000){r.dropSyncAt=now;await inventory.sync(b);}}
 else await t.walk(b,motor,g,state,api,scan,tasks);
 t.message='Recovering dropped home supplies before crafting replacements';return true;
}
function stance(t,b,q,state){
 const target=new Vec3(q.x,q.y,q.z),p=b.entity.position,candidates=[];
 const id=[q.x,q.y,q.z].join(','),excluded=t.homeRepair?.failedStances?.get(id)||new Set();
 const valid=(g,standing=new Vec3(g[0]+.5,g[1],g[2]+.5),margin=0)=>!excluded.has(g.join(','))&&!(q.floor&&Math.abs(q.y+1-standing.y)<.25&&q.x<standing.x+.31&&q.x+1>standing.x-.31&&q.z<standing.z+.31&&q.z+1>standing.z-.31)&&!(g[0]===q.x&&(g[2]===q.z||q.kind==='bed'&&g[2]===q.z+1)&&g[1]<=q.y+1&&g[1]+2>q.y)&&nav.standable(b,...g)&&space.clearOfPlayers(b,standing)&&placement.references(b,q,{standing}).some(ref=>ref.point.distanceTo(standing.offset(0,b.entity.eyeHeight||1.62,0))<=4.2-margin);
 // Work from the rim: descending for a nearer click can let subsequent fill
 // seal the worker into the crater. Never plan a descent to backfill it.
 const current=p.floored();if((!q.terrain||p.y>=t.plot.y-.25)&&valid([current.x,current.y,current.z],p))return [p.x,p.y+.1,p.z];
 const heights=q.terrain?[0,1]:[0,-1,1];
 for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(const dy of heights){
  const g=[target.x+x,t.plot.y+dy,target.z+z];
  const standing=new Vec3(g[0]+.5,g[1],g[2]+.5);
  if(q.terrain){standing.x+=Math.sign(target.x+.5-standing.x)*.3;standing.z+=Math.sign(target.z+.5-standing.z)*.3;}
  if(Math.hypot(x,z)<1||!valid(g,q.terrain?standing:undefined,q.terrain?0:.5))continue;
  const goal=[standing.x,standing.y+.1,standing.z];if(standing.offset(0,1.62,0).distanceTo(target.offset(.5,.5,.5))>4.2)continue;candidates.push(goal);
 }
 return candidates.sort((a,c)=>new Vec3(...a).distanceTo(p)-new Vec3(...c).distanceTo(p)).slice(0,12).find(g=>nav.route(b,g,24,2048,true,{bounds:state.world.bounds,reversible:true,forbidden:v=>(t.campPlots||[]).some(h=>(h.x!==t.plot.x||h.z!==t.plot.z)&&Math.abs(v[0]-h.x)<=3&&Math.abs(v[2]-h.z)<=3)}).reached)||null;
}
function safe(t,b,q,ignoreSelf=false){
 if(q.kind==='bed')return safe(t,b,{...q,kind:'bed_part'},ignoreSelf)&&safe(t,b,{...q,z:q.z+1,kind:'bed_part'},ignoreSelf);
 if(q.kind==='door')return safe(t,b,{...q,kind:'door_part'},ignoreSelf)&&safe(t,b,{...q,y:q.y+1,kind:'door_part'},ignoreSelf);
 const p=new Vec3(q.x,q.y,q.z);
 if(!terrain.owned(t,q.x,q.z))return false;
 if(q.terrain&&(!empty(b.blockAt(p))||!terrain.solid(b.blockAt(p.offset(0,-1,0)))))return false;
 if(q.floor&&empty(b.blockAt(p))&&!terrain.solid(b.blockAt(p.offset(0,-1,0))))return false;
 const occupants=ignoreSelf?space.players(b):[b.entity.position,...space.players(b)];
 if(!space.clearOfPlayers(b,p.offset(.5,.5,.5),1))return false;
 if(q.floor&&occupants.some(w=>Math.abs(q.y+1-w.y)<.25&&q.x<w.x+.31&&q.x+1>w.x-.31&&q.z<w.z+.31&&q.z+1>w.z-.31))return false;
 for(const who of occupants)if(q.x<who.x+.31&&q.x+1>who.x-.31&&q.z<who.z+.31&&q.z+1>who.z-.31&&q.y<who.y+1.8&&q.y+1>who.y+.05)return false;
 return [[0,0,0],[1,0,0],[-1,0,0],[0,-1,0],[0,1,0],[0,0,1],[0,0,-1]].every(([x,y,z])=>{const v=b.blockAt(p.offset(x,y,z));return v&&!['water','lava','fire','soul_fire'].includes(v.name)&&!v.getProperties?.().waterlogged;});
}
async function wood(t,b,r,needed){
 if(count(b,n=>n.endsWith('_planks'))>=needed&&count(b,n=>LOG.test(n))>=r.rawLogs)return true;
 const log=b.inventory.items().find(i=>LOG.test(i.name));
 if(log&&count(b,n=>LOG.test(n))>r.rawLogs){await t.craft(b,log.name.replace('_log','_planks'),1,null);return false;}
 Object.assign(r,{stage:'wood',woodNeeded:Math.max(needed,r.woodNeeded||0)});if(t.wilderness)t.wilderness.fuelTrip=false;
 t.phase='gather';t.supplyRun=true;t.grove=null;t.tree=null;t.treeApproach=null;t.resourceAt=0;return false;
}
async function tick(t,b,motor,state,api,scan,tasks){
 let r=t.homeRepair,damage=null;
 // A resupply trip can finish outside the loaded house area. Resume travel
 // before inspecting that area or asking the 24-block local stance planner.
 if(r?.stage==='wood'&&!needsWood(r,b)){
  r.stage='repair';t.phase='home_repair';t.path=[];t.navigator.lastPlan=-Infinity;return true;
 }
 if(r&&t.phase==='home_repair'&&(Math.hypot(b.entity.position.x-t.plot.x-.5,b.entity.position.z-t.plot.z-.5)>12||Math.abs(b.entity.position.y-t.plot.y)>3)){
  // A damaged entrance is not a prerequisite work stance. If the whole house
  // is loaded within the local planner's reach, repair from a checked rim
  // instead of demanding a route into the crater before backfilling it.
  const local=Math.hypot(b.entity.position.x-t.plot.x-.5,b.entity.position.z-t.plot.z-.5)<=24;
  if(local)damage=inspect(t,b);
  if(!damage||damage.unknown.length){
   r.message=t.message='Returning replacement supplies to the damaged home';
   if(await t.walk(b,motor,require('./world_navigation').homeApproach(t.plot,b),state,api,scan,tasks)===false)throw Error('No safe return route to the damaged home');
   return true;
  }
 }
 damage??=inspect(t,b);if(!damage||damage.unknown.length)return false;
 t.homeDamage=damage;
 if(!r){if(!damage.missing.length)return false;r=begin(t,damage);damage=inspect(t,b);t.homeDamage=damage;}
 if(r.stage==='wood')return false;
 if(r.stage==='stone'){
  if(count(b,'cobblestone')<8)return false;
  const m=t.wilderness?.mine;if(m&&m.stage!=='done'){if(!['exit','approach'].includes(m.stage)){m.stage='exit';m.exitIndex=m.path.length-1;}return false;}
  r.stage='repair';t.phase='home_repair';return true;
 }
 if(r.stage==='wool'){
  if(count(b,'white_wool')<3&&!count(b,n=>n.endsWith('_bed')))return false;r.stage='repair';t.phase='home_repair';return true;
 }
 if(t.phase!=='home_repair')return false;
 if(b.isSleeping){await require('./night_sleep').wake(t,b,motor);return true;}
 if(await salvage(t,b,motor,state,api,scan,tasks))return true;
 if(!damage.missing.length){
  const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));
  if(door?.getProperties?.().open){
   // The final work stance can be outside interaction reach or in the doorway.
   // Return to the verified room before closing, instead of retrying remotely.
   const goal=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],p=b.entity.position;
   if(Math.hypot(goal[0]-p.x,goal[2]-p.z)>.4||Math.abs(t.plot.y-p.y)>.4){
    t.message='Returning inside to secure the repaired home';await t.walk(b,motor,goal,state,api,scan,tasks);return true;
   }
   motor.pause();t.message='Closing the repaired home door';await require('./door_care').closeDoor(b,door);return true;
  }
  if(r.chestReplaced&&t.milestones.includes('stocked')){
   if(!await wood(t,b,r,8))return true;
   const q={...house.point(t.plot,'chest'),kind:'chest'},goal=stance(t,b,q,state);if(!goal)throw Error('No safe approach to restock the repaired chest');
   if(await t.walk(b,motor,goal,state,api,scan,tasks)!==true)return true;
   await require('./settlement').stockChest(b,b.blockAt(house.point(t.plot,'chest')),8);r.chestReplaced=false;return true;
  }
  if(r.bedReplaced){const p=house.point(t.plot,'bed');t.home=await api('/world/survival',{agent:b.username,run:state.run,action:'home',position:p.toArray()});r.bedReplaced=false;}
  t.phase=r.resume;t.supplyRun=r.supplyRun;if(t.wilderness){t.wilderness.fuelTrip=r.fuelTrip;if(r.survivalResume)t.wilderness.resume=r.survivalResume;}
  t.homeRepair=null;t.path=[];t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();t.message='Home repaired and verified; resuming the interrupted lesson';return true;
 }
 Object.assign(r,budget(damage.missing,b,r.chestReplaced&&t.milestones.includes('stocked')));
 t.message=r.message='Repairing home: '+damage.missing.length+' parts remaining';
 if(needsWood(r,b)){motor.pause();await wood(t,b,r,r.woodNeeded);return true;}
 if(count(b,n=>n.endsWith('_planks'))<r.woodNeeded){
  const log=b.inventory.items().find(i=>LOG.test(i.name));if(log&&count(b,n=>LOG.test(n))>r.rawLogs){motor.pause();await t.craft(b,log.name.replace('_log','_planks'),1,null);return true;}
 }
 // Foundations/floor first, then workbench, shell, door and furnishings.
 const rank=q=>q.kind==='foundation'?0:q.floor?1:q.kind==='crafting_table'?2:q.kind==='planks'?3:q.kind==='door'?4:5;
 let choice=null;
 for(const q of damage.missing.sort((a,c)=>rank(a)-rank(c)||a.y-c.y)){
  if(['door','chest','furnace','bed'].includes(q.kind)&&!count(b,n=>q.kind==='door'?n.endsWith('_door'):q.kind==='bed'?n.endsWith('_bed'):n===q.kind)&&b.blockAt(house.point(t.plot,'table'))?.name!=='crafting_table')continue;
  if(!safe(t,b,q,true))continue;const goal=stance(t,b,q,state);if(goal){choice={q,goal};break;}
 }
 if(!choice){if(await require('./escape_column').attempt(t,b,motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z-4.5],state))return true;r.message=t.message='Home repair: no safe supported work stance yet';return true;}
 const {q,goal}=choice;
 if(await t.walk(b,motor,goal,state,api,scan,tasks)!==true)return true;motor.pause();
 if(!safe(t,b,q)){t.message='Rechecking clear footing before home repair';return true;}
 // Recover an owned misplaced workbench only after foundation repair and a
 // checked approach. Preserve player support and all normal digging guards.
 if(q.kind==='furnace'&&b.blockAt(new Vec3(q.x,q.y,q.z))?.name==='crafting_table'&&safe(t,b,{...q,floor:true})){
  const block=b.blockAt(new Vec3(q.x,q.y,q.z));
  if(await access.dig(b,block,{validate:v=>v.name==='crafting_table'&&safe(t,b,{...q,floor:true})})){t.lastProgress=Date.now();t.message='Recovering the misplaced workbench before restoring the furnace';}
  return true;
 }

 const planks=b.inventory.items().find(i=>i.name.endsWith('_planks'))?.name||'oak_planks';
 let item=q.kind==='foundation'?terrain.material(b,damage.missing.some(v=>v.kind==='furnace')?8:0):q.kind==='planks'?planks:q.kind==='door'?(b.inventory.items().find(i=>i.name.endsWith('_door'))?.name||planks.replace('_planks','_door')):q.kind==='bed'?(b.inventory.items().find(i=>i.name.endsWith('_bed'))?.name||'white_bed'):q.kind;
 if(['bed','door'].includes(q.kind)){
  const cells=[new Vec3(q.x,q.y,q.z),new Vec3(q.x,q.y+(q.kind==='door'?1:0),q.z+(q.kind==='bed'?1:0))];
  const remnant=cells.map(p=>b.blockAt(p)).find(v=>v?.name.endsWith(q.kind==='bed'?'_bed':'_door'));
  if(remnant){if(remnant.getProperties?.().occupied){t.message='Waiting for the damaged bed to be vacated';return true;}await b.dig(remnant,true);t.lastProgress=Date.now();return true;}
 }
 if(q.kind==='torch'){
  if(!count(b,'torch')){
   if(!count(b,'stick')){await t.craft(b,'stick',1,null);return true;}
   if(!count(b,n=>n==='coal'||n==='charcoal')){
    const log=b.inventory.items().find(i=>LOG.test(i.name));if(!log){await wood(t,b,r,r.woodNeeded+4);return true;}
    const hearth=b.blockAt(house.point(t.plot,'furnace'));if(hearth?.name!=='furnace'){t.message='Restoring the furnace before making replacement charcoal';return true;}
    await require('./furnace').smelt(b,hearth,log.name,'charcoal',n=>n.endsWith('_planks'));return true;
   }
   await t.craft(b,'torch',1,null);return true;
  }
  await require('./house_lighting').place(b,t.plot,q.side,t);
 }else{
  if(!count(b,item)&&q.kind!=='planks'&&q.kind!=='foundation'){
   if(q.kind==='furnace'&&count(b,'cobblestone')<8){if(!t.wilderness)throw Error('Home repair needs eight real cobblestone');r.stage='stone';t.phase='night_stone';return true;}
   if(q.kind==='bed'&&count(b,'white_wool')<3){if(!t.wilderness)throw Error('Home repair needs three real white wool');r.stage='wool';t.phase='night_wool';return true;}
   const needsTable=['door','chest','furnace','bed'].includes(q.kind),table=b.blockAt(house.point(t.plot,'table'));
   if(needsTable&&table?.name!=='crafting_table'){r.message=t.message='Repairing the workbench before furniture';return true;}
   await t.craft(b,item,1,needsTable?table:null);return true;
  }
  if(q.kind==='bed'){
   const foot=new Vec3(q.x,q.y,q.z);if(!empty(b.blockAt(foot))||!empty(b.blockAt(foot.offset(0,0,1))))throw Error('Repaired bed space is obstructed');
   await inventory.equip(b,item);await b.look(Math.PI,0,true);await b._placeBlockWithOptions(b.blockAt(foot.offset(0,-1,0)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});
  }else{
   const occupied=b.blockAt(new Vec3(q.x,q.y,q.z));
   if(q.floor&&!empty(occupied)){
    if(!require('./floor_builder').safeFoundation(b,occupied))throw Error('Damaged floor contains an unsafe obstruction');
    if(!await access.dig(b,occupied,{validate:v=>require('./floor_builder').safeFoundation(b,v)&&safe(t,b,q)}))return true;
   }
   if(q.kind==='door')await b.look(Math.PI,0,true);
   try{await t.place(b,q,item);}catch(error){
    if(error.code!=='BUILD_OBSTRUCTED')throw error;
    r.failedStances??=new Map();const id=[q.x,q.y,q.z].join(',');
    if(!r.failedStances.has(id))r.failedStances.set(id,new Set());
    const p=b.entity.position.floored();r.failedStances.get(id).add([p.x,p.y,p.z].join(','));
    t.path=[];t.navigator.lastPlan=-Infinity;t.message='Repair support changed; checking another reachable work position';return true;
   }
  }
 }
 if(['door','bed'].includes(q.kind))for(let i=0;i<20&&!matches(b,q);i++)await new Promise(resolve=>setTimeout(resolve,50));
 if(!matches(b,q)){
  const actual=b.blockAt(new Vec3(q.x,q.y,q.z));
  throw Error('Home repair placement did not verify: '+q.kind+' at '+[q.x,q.y,q.z].join(',')+'; actual '+actual?.name+' '+JSON.stringify(actual?.getProperties?.()));
 }
 if(q.kind==='chest')r.chestReplaced=true;if(q.kind==='bed')r.bedReplaced=true;
 r.failedStances?.delete([q.x,q.y,q.z].join(','));r.repaired++;t.lastProgress=Date.now();return true;
}
module.exports={matches,expected,inspect,observe,budget,needsWood,collecting,stance,safe,tick,report,empty};

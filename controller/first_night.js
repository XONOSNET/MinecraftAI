// Small explicit survival planner. Skill policies still choose movement/harvesting.
const {Vec3}=require('vec3'),{WildernessMemory}=require('./wilderness_memory'),{standable,route}=require('./field_navigation'),{visibleBlock}=require('./target_scan'),inventory=require('./inventory_sync'),furnace=require('./furnace'),house=require('./house'),{closeDoor}=require('./door_care'),combat=require('./combat');
const livestock=require('./first_night_livestock'),{Exploration}=require('./exploration'),resourceConfig=require('../config/world-resources.json'),resourceScan=require('./resource_scan');
const nightSleep=require('./night_sleep');
const shelterPolicy=require('./shelter_policy');
const RAW={beef:'cooked_beef',porkchop:'cooked_porkchop',mutton:'cooked_mutton',chicken:'cooked_chicken',rabbit:'cooked_rabbit'},FOOD=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_rabbit','apple','bread'],ANIMALS=['cow','pig','sheep','chicken','rabbit'];
const SAFE_RAW=['beef','porkchop','mutton','rabbit'];
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','creeper','spider','cave_spider','witch','pillager','vindicator','enderman']);
const count=(b,n)=>b.inventory.items().filter(i=>i.name===n).reduce((s,i)=>s+i.count,0),meals=b=>FOOD.reduce((s,n)=>s+count(b,n),0),raw=b=>Object.keys(RAW).reduce((s,n)=>s+count(b,n),0);
const enabled=w=>w.mission==='first_night',handles=p=>p.startsWith('night_');
const inside=(p,b)=>p.x>b[0]+2&&p.x<b[1]-3&&p.z>b[2]+2&&p.z<b[3]-3;
function init(t,w){t.wilderness={exploration:new Exploration(),memory:new WildernessMemory(w.memory||{}),priority:'Survey',reason:'Locate a safe home and nearby resources',searches:0,recoveries:0,foodConsumed:0,attacked:0};}
function priority(b,t,w){
 const n=t.wilderness,sheltered=t.milestones.includes('hut')&&!t.homeDamage?.unsafe,threat=Object.values(b.entities).find(e=>HOSTILES.has(e.name)&&e.isValid!==false&&e.position.distanceTo(b.entity.position)<10&&combat.visible(b,e));
 const needsHealing=b.health<18&&b.food<18;
 if(meals(b)&&(b.food<=16||needsHealing))return {kind:'eat',reason:'Restore hunger before continuing'};
 if((b.food<=10||n.resume&&needsHealing)&&SAFE_RAW.some(name=>count(b,name)))return {kind:'eat raw',reason:'Emergency food while cooking is unavailable'};
 const risk=shelterPolicy.assess(b,w);
 if(risk.mode==='cover'||n.shelterWatch&&shelterPolicy.danger(b))return {kind:sheltered?'retreat':'seek cover',reason:risk.mode==='cover'?risk.reason:'Sheltered: wait for daylight and a clear area'};
 if(risk.mode==='fight')return {kind:'defend',reason:risk.reason};
 if(t.phase==='night_seek_cover')return {kind:'resume',reason:'Daylight and a clear area allow work to resume'};
 if(sheltered&&(b.health<12||threat))return {kind:'retreat',reason:threat?'Visible '+threat.name+' nearby':'Recover health inside the hut'};
 if(n.resume&&b.health>=18&&!threat)return {kind:'resume',reason:'Safe to continue the interrupted task'};
 if(t.phase==='night_recover'&&n.resume&&needsHealing&&b.health>=12&&!threat&&!meals(b)&&b.inventory.items().some(i=>i.name.endsWith('_axe')))return {kind:'recovery forage',reason:'Health regeneration requires food; gather provisions before recovering'};
 return {kind:handles(t.phase)?t.phase.replace('night_','').replaceAll('_',' '):t.phase.replaceAll('_',' '),reason:sheltered?'Develop and provision the home':'Gather enough materials for a secure shelter'};
}
async function interrupt(t,b,motor,state,api,scan){
 if(t.wilderness.burrow)return require('./emergency_burrow').tick(t,b,motor,state,api,scan,require('./tasks'));
 const n=t.wilderness,p=priority(b,t,state.world);n.priority=p.kind;n.reason=p.reason;
 const time=b.time?.timeOfDay;if(time>=13000&&time<23000)n.nightSeen=true;
 if(t.phase==='night_hold')nightSleep.observe(t,b);
 if(b.isSleeping&&(t.phase!=='night_hold'||['eat','eat raw'].includes(p.kind)||b.health<12))return nightSleep.wake(t,b,motor);
 // Keep a sleeping bot still. Awake bots watch from shelter if monsters prevent bed use.
 if(b.isSleeping)return false;
 if(p.kind==='eat'||p.kind==='eat raw'){motor.pause();await inventory.equip(b,(p.kind==='eat'?FOOD:SAFE_RAW).find(n=>count(b,n)));await b.consume();n.foodConsumed++;t.lastProgress=Date.now();return true;}
 if(p.kind==='seek cover'||p.kind==='retreat'&&shelterPolicy.wantsCover(b,state.world))n.shelterWatch=true;
 if(n.shelterWatch&&!shelterPolicy.danger(b))n.shelterWatch=false;
 if(p.kind==='defend'&&await require('./survival_defense').tick(t,b,motor,state,api,scan))return true;
 if(await require('./emergency_burrow').tick(t,b,motor,state,api,scan,require('./tasks')))return true;
 if(p.kind==='seek cover'){
  // Retry verified refuge selection; never fall through to harvesting or combat.
  // Move away from visible threats only over a checked reversible route.
  n.coverResume??=t.phase;t.phase='night_seek_cover';
  await require('./emergency_burrow').seek(t,b,motor,state,api,scan,require('./tasks'));
  return true;
 }
 if(t.phase==='night_seek_cover'){t.phase=n.coverResume||'gather';delete n.coverResume;t.path=[];t.navigator.lastPlan=-Infinity;return true;}
 if(await require('./survival_defense').tick(t,b,motor,state,api,scan))return true;
 if(p.kind==='retreat'&&!(t.phase==='night_hold'&&b.health>=12)&&!['night_retreat','night_recover'].includes(t.phase)){n.resume=t.phase;n.recoveries++;t.phase='night_retreat';t.path=[];t.navigator.lastPlan=-Infinity;return true;}
 if(p.kind==='resume'&&['night_retreat','night_recover'].includes(t.phase)){t.phase=n.resume;delete n.resume;t.lastProgress=Date.now();return true;}
 if(p.kind==='recovery forage'){
  n.forageResume='night_retreat';t.phase='night_forage';t.path=[];t.navigator.lastPlan=-Infinity;
  t.message=p.reason;return true;
 }
 if(b.food<=10&&!['night_food','night_wool','night_forage','night_retreat','night_recover'].includes(t.phase)&&b.inventory.items().some(i=>i.name.endsWith('_axe'))&&!n.forageResume){n.forageResume=t.phase;t.phase='night_forage';return true;}
 return false;
}
function approaches(b,block,bounds){
 const q=block.position,result=[];
 // Never mine the floor under the current route. Surface faces only; no blind tunnelling.
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const y of [q.y,q.y-1,q.y+1]){
  const p=new Vec3(q.x+dx+.5,y+.1,q.z+dz+.5);if(inside(p,bounds)&&standable(b,Math.floor(p.x),y,Math.floor(p.z))&&p.offset(0,1.62,0).distanceTo(q.offset(.5,.5,.5))<4.2)result.push([p.x,p.y,p.z]);
 }return result;
}
async function pickup(t,b,motor,state,api,scan,tasks,names){
 const n=t.wilderness,p=b.entity.position,now=Date.now();n.ignoredDrops??=new Map();
 const drop=Object.values(b.entities).filter(e=>e.name==='item'&&e.isValid!==false&&e.position.distanceTo(p)<8&&Math.abs(e.position.y-p.y)<1.4&&now>(n.ignoredDrops.get(e.id)||0)&&livestock.localDrop(t,state.world,e.position)&&names.includes(require('./survival').itemName(b,e))).sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p))[0];
 if(!drop)return false;
 n.pickupSince??=now;if(n.pickupId!==drop.id){n.pickupId=drop.id;n.pickupSince=now;n.pickupProgressAt=now;n.pickupBest=Infinity;}
 const distance=drop.position.distanceTo(p);if(distance<n.pickupBest-.25){n.pickupBest=distance;n.pickupProgressAt=now;}
 if(now-n.pickupSince>30000||now-n.pickupProgressAt>10000){n.ignoredDrops.set(drop.id,now+5000);n.pickupId=null;return false;}
 const q=drop.position,goals=[[q.x,Math.floor(q.y)+.1,q.z],...approaches(b,{position:q.floored()},state.world.bounds)].filter(g=>standable(b,Math.floor(g[0]),Math.round(g[1]),Math.floor(g[2]))&&new Vec3(...g).distanceTo(q)<1.6);
 const goal=goals.find(g=>route(b,g,16,1024,true,{bounds:state.world.bounds,reversible:true}).reached);
 if(!goal){n.ignoredDrops.set(drop.id,now+5000);return false;}
 if(p.distanceTo(q)<1.1){motor.pause();await inventory.sync(b);}else await t.walk(b,motor,goal,state,api,scan,tasks);
 t.message='Collecting '+require('./survival').itemName(b,drop);return true;
}
async function explore(t,b,motor,state,api,scan,tasks,surface,kind='wood'){
 const n=t.wilderness,p=b.entity.position,bounds=state.world.bounds,now=Date.now();
 n.exploration??=new Exploration();n.exploration.observe(p);
 if(n.searchKind!==kind){n.searchGoal=null;n.searchKind=kind;n.noResourceAt=null;}
 if(n.searchGoal&&Math.hypot(n.searchGoal[0]-p.x,n.searchGoal[2]-p.z)<1){n.exploration.finish(b,kind,n.searchGoal,now);n.memory.visited.add(n.searchGoal.map(Math.floor).join(','));n.searchGoal=null;t.lastProgress=now;}
 if(!n.searchGoal){
  if(now<(n.searchPlanAt||0)){motor.pause();t.message='Planning the next '+kind+' expedition';return;}n.searchPlanAt=now+2500;
  // Search only still-present loaded resources, while preserving observed
  // landmark locations for the separate remembered-resource round trip.
  const available=n.memory.resources.filter(r=>{
   if(r.kind!==kind||!['wood','stone'].includes(kind))return true;
   const block=b.blockAt(new Vec3(...r.position).floored());return !block||(kind==='wood'?block.name.endsWith('_log'):block.name==='stone');
  });
  const known=available.filter(r=>r.kind===kind&&n.memory.available(r.position)).sort((a,c)=>new Vec3(...a.position).distanceTo(p)-new Vec3(...c.position).distanceTo(p)).flatMap(r=>approaches(b,{position:new Vec3(...r.position).floored()},bounds)).filter(g=>n.memory.available(g)).slice(0,12);
  n.searchGoal=await n.exploration.choose(b,{...state.world,run:state.run,plots:t.campPlots||[]},surface,known,kind,now);
  if(!n.searchGoal){motor.pause();t.message=n.exploration.state+' for '+kind;n.noResourceAt??=now;if(now-n.noResourceAt>resourceConfig.empty_search_seconds*1000){t.failureCategory='resource_unavailable';throw Error('No reachable '+kind+' after checking the loaded expedition region');}return;}
  n.searches++;delete n.noResourceAt;
 }
 n.exploration.hold(b,state.run,n.searchGoal);
 const distance=Math.round(Math.hypot(n.searchGoal[0]-p.x,n.searchGoal[2]-p.z));
 t.message='Scouting '+kind+' · '+distance+'m to search patch · '+n.exploration.visits.size+' patches visited';
 const moved=await t.walk(b,motor,n.searchGoal,state,api,scan,tasks);
 if(moved===false){n.memory.reject(n.searchGoal);n.exploration.reject(b,n.searchGoal,now);n.searchGoal=null;n.recoveries++;}

}
async function tick(t,b,motor,state,api,scan,tasks,surface){
 const w=state.world,n=t.wilderness,now=Date.now(),p=b.entity.position,home=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],door=()=>b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));
 const next=phase=>{t.phase='night_'+phase;t.lastProgress=Date.now();n.searchGoal=null;};
 const move=async(goal,phase)=>{if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){motor.pause();next(phase);}};
 // Resource searches start outside. Otherwise line-of-sight and the closed
 // doorway correctly reject every outdoor candidate before a route is chosen.
 if(['night_stone','night_food','night_wool','night_forage','night_scout','night_fuel'].includes(t.phase)&&(n.leaving||require('./world_navigation').insideHome(p,t.plot))){
  n.leaving=true;const exterior=require('./world_navigation').homeApproach(t.plot,b);if(await t.walk(b,motor,exterior,state,api,scan,tasks)===true)n.leaving=false;t.message='Leaving the hut to search for resources';return;
 }
 if(t.phase==='night_bootstrap'){
  const pos=house.point(t.plot,'table');t.message='Making an axe early to speed up shelter harvesting';
  // Leave a body-width margin from the new table, even at the accepted
  // edge of the approach radius. The old radius allowed self-collision.
  // A refused placement must change the approach, rather than repeating the
  // same obstructed click until all retries are exhausted.
  const offsets=[[1.8,.5],[.5,1.8],[-.8,.5]],offset=offsets[Math.min(n.bootstrapRetries||0,offsets.length-1)];
  const stance=new Vec3(pos.x+offset[0],pos.y+.1,pos.z+offset[1]),ready=()=>b.entity.position.distanceTo(stance)<=.42;
  if(!ready()){await t.walk(b,motor,[stance.x,stance.y,stance.z],state,api,scan,tasks);return;}
  motor.pause();
  if(b.entity.onGround===false||Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){t.message='Stopping at a clear workbench-building stance';return;}
  for(const item of [...b.inventory.items()].filter(i=>i.name.endsWith('_log')))await t.craft(b,item.name.replace('_log','_planks'),item.count,null);
  if(!ready()){t.navigator.lastPlan=-Infinity;t.message='Rechecking the workbench stance after crafting';return;}
  if(b.blockAt(new Vec3(pos.x,pos.y,pos.z))?.name!=='crafting_table'){
   if(!count(b,'crafting_table'))await t.craft(b,'crafting_table',1,null);
   if(!ready()||b.entity.onGround===false||Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){t.navigator.lastPlan=-Infinity;t.message='Rechecking clear footing before placing the workbench';return;}
   try{await t.place(b,pos,'crafting_table');}catch(error){if(!String(error.message).includes('Server refused')||(n.bootstrapRetries=(n.bootstrapRetries||0)+1)>=3)throw error;t.path=[];t.navigator.lastPlan=-Infinity;t.message='Workbench placement was obstructed; checking the close approach again';return;}
  }
  const table=b.blockAt(new Vec3(pos.x,pos.y,pos.z));if(count(b,'stick')<2)await t.craft(b,'stick',1,null);
  if(!count(b,'wooden_axe'))await t.craft(b,'wooden_axe',1,table);await inventory.equip(b,'wooden_axe');t.table=pos;n.bootstrap=true;t.phase='gather';t.lastProgress=Date.now();
 }else if(t.phase==='night_stone'){
  if(count(b,'cobblestone')>=16&&(!n.mine||n.mine.stage==='done')){t.milestone('quarry');next('fuel');return;}
  if(n.mine&&n.mine.stage!=='done'){await require('./staircase_mining').tick(t,b,motor,state,api,scan,tasks);return;}
  // First Night gathers exposed faces, not floor blocks. Removing neighboring
  // support below our feet was creating low-ceiling pockets with no jump out.
  if(!n.stoneScan||now-n.stoneScan>2500){n.stoneScan=now;n.stones=(await resourceScan.stone(b,{bounds:w.bounds})).map(q=>b.blockAt(q)).filter(q=>q&&inside(q.position,w.bounds)&&q.position.y>=Math.floor(p.y)&&q.position.y<=p.y+3&&!(Math.floor(p.x)===q.position.x&&Math.floor(p.z)===q.position.z));}
  if(await pickup(t,b,motor,state,api,scan,tasks,['cobblestone']))return;
  const candidates=(n.stones||[]).filter(q=>q.position.y>=Math.floor(p.y)&&b.blockAt(q.position)?.name==='stone'&&n.memory.available([q.position.x,q.position.y,q.position.z])&&!require('./resource_space').busy(b,state.run,q.position)).sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p));
  const target=candidates.find(q=>q.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&b.canDigBlock(q)&&q.position.y>=Math.floor(p.y)-1&&!(q.position.x===Math.floor(p.x)&&q.position.z===Math.floor(p.z))&&visibleBlock(b,q));
  if(target){n.memory.remember('stone',target.position);t.harvestTarget=target.position;await t.harvest(b,motor,target.position,state,api,scan,tasks,'wooden_pickaxe');n.stoneScan=0;}
  else{
   const covered=candidates.find(q=>require('./resource_access').canClear(b,q.position,{bounds:w.bounds,plots:[t.plot,...(t.campPlots||[])]}));
   if(covered&&(await t.accessResource(b,motor,covered.position,state)).handled){n.stoneScan=0;return;}
   let chosen=n.stoneApproach;
   if(chosen&&(!candidates.some(q=>q.position.equals(chosen.q.position))||!standable(b,Math.floor(chosen.goal[0]),Math.round(chosen.goal[1]),Math.floor(chosen.goal[2]))))chosen=null;
   if(!chosen&&now>=(n.stonePlanAt||0)){
    n.stonePlanAt=now+2000;for(const q of candidates.slice(0,6)){const goal=approaches(b,q,w.bounds).filter(g=>require('./resource_access').corridor(b,q.position,new Vec3(...g)).clear).sort((a,c)=>new Vec3(...a).distanceTo(p)-new Vec3(...c).distanceTo(p)).slice(0,2).find(g=>route(b,g,48,1024,true,{bounds:w.bounds,reversible:true}).reached);if(goal){chosen={q,goal};break;}}n.stoneApproach=chosen;
   }
   if(chosen){n.memory.remember('stone',chosen.q.position);const arrived=await t.walk(b,motor,chosen.goal,state,api,scan,tasks);if(arrived===true||arrived===false){n.memory.reject([chosen.q.position.x,chosen.q.position.y,chosen.q.position.z]);n.stoneScan=0;n.stoneApproach=null;}}
   else{
    const mined=await require('./staircase_mining').tick(t,b,motor,state,api,scan,tasks);
    if(!mined.handled||n.mine?.stage==='done')await explore(t,b,motor,state,api,scan,tasks,surface,'stone');
   }
  }t.message=t.message||`Natural stone ${count(b,'cobblestone')} / 16`;
 }else if(t.phase==='night_fuel'){
  if(b.inventory.items().filter(i=>i.name.endsWith('_log')).reduce((s,i)=>s+i.count,0)>=4){t.phase='stone_return';t.lastProgress=now;}
  else{n.fuelTrip=true;t.supplyRun=true;t.grove=null;t.resourceAt=0;t.phase='gather';}
 }else if(t.phase==='night_food'||t.phase==='night_wool'||t.phase==='night_forage'){
  const wool=t.phase==='night_wool';livestock.observe(t,b,w);n.rejectedAnimals??=new Map();
  if(wool&&!w.first_night.stations)n.livestock_status={...(n.livestock_status?.resource==='wool'?n.livestock_status:{}),resource:'wool',wool:count(b,'white_wool'),wool_target:3};
  // Keep bed material dropped during food hunting before leaving to cook.
  if(!wool&&t.phase!=='night_forage'&&count(b,'white_wool')<3&&await pickup(t,b,motor,state,api,scan,tasks,['white_wool']))return;
  if(t.phase==='night_forage'&&(SAFE_RAW.reduce((s,name)=>s+count(b,name),0)>=2||meals(b)>=2)){t.phase=n.forageResume||'night_food';delete n.forageResume;t.lastProgress=now;return;}
  if(t.phase!=='night_forage'&&(wool?count(b,'white_wool')>=3:meals(b)+raw(b)>=4)){t.milestone(wool?'wool':'food_found');next(wool?'wool_home':'food_home');return;}
  if(await pickup(t,b,motor,state,api,scan,tasks,wool?['white_wool']:Object.keys(RAW).concat(FOOD)))return;
  const selection=require('./hunt_targets').choose(t,b,state,approaches,now),animal=selection.animal;
  n.livestock_status={...selection.status,wool:count(b,'white_wool'),wool_target:3};
  if(animal){let huntMessage=null;delete n.noResourceAt;if(n.animal!==animal.id){n.animalGoal=null;n.animalPlanAt=0;}n.animal=animal.id;n.memory.remember('food',animal.position);if(livestock.whiteSheep(b,animal))n.memory.remember('wool',animal.position);
   if(!require('./hunt_targets').inHuntRange(b,animal,combat.visible(b,animal))){
    const goal=selection.goal;
    if(!goal||await t.walk(b,motor,goal,state,api,scan,tasks,{hunting:true})===false){require('./hunt_targets').defer(n,b,animal,now);require('./hunt_targets').release(b.username);n.animal=null;n.huntApproach=null;t.message='Animal approach blocked; checking another reachable target';}
   }else{
    const task={kind:'combat',combat_style:'hunt',auto_equip_for_attack:true,mobs:[animal.name],mob_label:w.first_night.stations?'FirstNight'+b.username:'',target_id:animal.id,bounds:w.bounds,min_y:-60,max_y:190,weapon:count(b,'stone_axe')?'stone_axe':'wooden_axe',kill_target:1,stationary:false,attack_delay_ms:1000,safe_walk:true,strict_ground:true};
    const runtime=n.combat||=( {} ),sensed=combat.observe(b,task,runtime),rays=scan(b),obs=[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0,...sensed.extra];
    const result=await api('/step',{agent:b.username,run:state.run,world_skill:'combat',obs,teacher:combat.teacher(sensed,task),reward:0,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:rays.hits,perception_ms:0,steps:0,goal:[animal.position.x,animal.position.y,animal.position.z],task:'combat',metrics:sensed.metrics});
    motor.command(result.action,task,{...sensed,...rays.proximity},sensed.angle);
    if(result.action===6&&!sensed.gear.weapon)motor.pause();
    if([4,5,6].includes(result.action)&&await combat.interact(b,task,sensed,runtime,result.action,{combat_practice:true})&&result.action===6){
     n.attacked++;n.huntDropOrigin={position:animal.position.clone(),until:Date.now()+30000};t.lastProgress=now;
     // Wake only the assigned animal after a real hit. Its normal AI handles panic.
     if(w.first_night.stations&&animal.uuid){n.releasedAnimals??=new Set();if(!n.releasedAnimals.has(animal.uuid)){await api('/world/livestock',{agent:b.username,run:state.run,action:'release',species:animal.name,entity_uuid:animal.uuid});n.releasedAnimals.add(animal.uuid);}}
    }
    huntMessage=runtime.equipmentStatus;
   }
   if(n.animal!==null)t.message=huntMessage||(wool?'Collecting white wool · '+count(b,'white_wool')+' / 3':'Gathering food · '+(meals(b)+raw(b))+' / 4 meals · '+animal.name);
  }else if(!await livestock.support(t,b,motor,state,api,scan,tasks,wool?'wool':'food')){await explore(t,b,motor,state,api,scan,tasks,surface,wool?'wool':'food');if(selection.status.loaded_white_sheep&&wool)t.message+=' · '+selection.status.selection_reason;}
 }else if(t.phase==='night_food_home')await move(home,'cook');
 else if(t.phase==='night_cook'){
  motor.pause();const d=door();if(d?.getProperties().open&&!await closeDoor(b,d))return;
  if(meals(b)>=4){t.milestone('cooked_meals');t.milestone('provisioned');next('wool');return;}
  const input=Object.keys(RAW).find(name=>count(b,name));if(!input){next('food');return;}
  t.message='Cooking '+input+' · '+meals(b)+' / 4 ready meals';
  if(!b.inventory.items().some(i=>i.name.endsWith('_planks')||i.name==='charcoal'||i.name==='coal')){const log=b.inventory.items().find(i=>i.name.endsWith('_log'));if(!log)throw Error('No cooking fuel remains; need another wood trip');await t.craft(b,log.name.replace('_log','_planks'),1,null);}
  await furnace.smelt(b,b.blockAt(house.point(t.plot,'furnace')),input,RAW[input],n=>n.endsWith('_planks')||n==='charcoal'||n==='coal'||n==='stick');await inventory.sync(b);t.lastProgress=Date.now();
 }else if(t.phase==='night_wool_home')await move(home,'bed');
 else if(t.phase==='night_bed'){
  motor.pause();await inventory.sync(b);
  if(!count(b,'white_bed')){
   if(b.inventory.items().filter(i=>i.name.endsWith('_planks')).reduce((s,i)=>s+i.count,0)<3){const log=b.inventory.items().find(i=>i.name.endsWith('_log'));if(!log)throw Error('Need three planks for the bed');await t.craft(b,log.name.replace('_log','_planks'),1,null);}
   await t.craft(b,'white_bed',1,b.blockAt(house.point(t.plot,'table')));
  }
  const foot=house.point(t.plot,'bed'),head=foot.offset(0,0,1);
  if(b.blockAt(foot)?.name!=='white_bed'){
   if(b.blockAt(head)?.name!=='air')throw Error('Bed head space is obstructed');
   await inventory.equip(b,'white_bed');await b.look(Math.PI,0,true);await new Promise(r=>setTimeout(r,100));await b._placeBlockWithOptions(b.blockAt(foot.offset(0,-1,0)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});
  }
  for(let i=0;i<40&&(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(head)?.name!=='white_bed');i++)await new Promise(r=>setTimeout(r,25));
  if(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(head)?.name!=='white_bed')throw Error('Both bed blocks must verify before setting home');
  t.home=await api('/world/survival',{agent:b.username,run:state.run,action:'home',position:[foot.x,foot.y,foot.z]});t.milestone('bed_home');next('scout');
 }else if(t.phase==='night_scout'){
  if(!n.scoutGoal){
   n.scoutSearchAt??=now;
   if(now<(n.scoutPlanAt||0)){motor.pause();t.message='Checking the next remembered resource route';return;}n.scoutPlanAt=now+2000;
   n.scoutGoal=require('./scouting').choose(b,t,w,surface,now);
   if(!n.scoutGoal){
    motor.pause();const plan=n.scoutPlanning;
    t.message='Scouting: checked '+plan.checked+' / '+plan.goals.length+' grounded approaches to remembered resources';
    const deadline=Math.max(30000,Math.ceil(plan.goals.length/4)*2000+5000);
    if(now-n.scoutSearchAt>deadline){t.failureCategory='landmark_unavailable';throw Error('No reachable remembered wood or stone landmark for the scouting round trip ('+plan.checked+' approaches checked)');}return;
   }
  }
  t.message='Revisit a remembered resource, then navigate home';
  const arrived=await t.walk(b,motor,n.scoutGoal,state,api,scan,tasks);
  if(arrived===true){motor.pause();next('scout_home');}
  else if(arrived===false){n.scoutRejected.add(n.scoutGoal.join(','));n.scoutGoal=null;}
 }else if(t.phase==='night_scout_home'){await move(home,'hold');if(t.phase==='night_hold'){t.milestone('round_trip');n.holdAt=now;}}
 else if(t.phase==='night_retreat')await move(home,'recover');
 else if(t.phase==='night_recover'){
  motor.pause();const d=door();if(d?.getProperties().open&&!await closeDoor(b,d))return;t.message='Sheltered recovery · health '+b.health+' / 20';
  if(n.shelterWatch){t.message='Sheltered: waiting for daylight and nearby monsters to clear';return;}
  if(b.health<12&&b.food<18&&!meals(b)&&!SAFE_RAW.some(name=>count(b,name))){t.failureCategory='food_exhausted';throw Error('Cannot regenerate health below food 18; no safe recovery food remains and health is too low for foraging');}
  if(!meals(b)&&b.food<10){t.failureCategory='food_exhausted';throw Error('Insufficient food to recover safely');}
 }else if(t.phase==='night_hold'){
  motor.pause();const d=door();if(d?.getProperties().open){if(b.isSleeping){await nightSleep.wake(t,b,motor);return;}t.message='Securing the shelter door before bed';await closeDoor(b,d);return;}
  if(!d?.name.endsWith('_door')||d.getProperties().open!==false)throw Error('Shelter door did not verify closed');
  if(!require('./hut_teacher').intact(b,t.plot))throw Error('Shelter enclosure no longer intact');
  n.holdAt??=now;const elapsed=w.first_night.hostiles?(now-t.started)/1000:(now-n.holdAt)/1000,left=Math.max(0,Math.ceil(w.first_night.hold_seconds-elapsed));
  if(meals(b)<1&&b.food<16){if(await nightSleep.wake(t,b,motor))return;next('food');return;}
  const sleepStatus=await nightSleep.tick(t,b,motor,goal=>t.walk(b,motor,goal,state,api,scan,tasks),now);
  Object.assign(n.sleep,{watch_seconds_left:left,watch_seconds_total:w.first_night.hold_seconds,watch_updated_at:now/1000});
  t.message=`${sleepStatus} · watch ${left} s left · health ${b.health} · food ${b.food}`;
  if(left===0&&b.health>=12&&b.food>=10&&n.sleep.morning_seen&&!b.isSleeping){t.milestone('survived');t.phase='complete';t.message='First Night complete: morning verified after a safe, provisioned shelter watch';}
 }
}
function report(t){const n=t.wilderness;return n?{priority:n.priority,reason:n.reason,searches:n.searches,recoveries:n.recoveries,food_consumed:n.foodConsumed,burrow:require('./emergency_burrow').report(t),mining:require('./staircase_mining').report(t),home_repair:require('./home_repair').report(t),cover_search:{searches:n.coverSearches||0,routes_checked:n.coverRoutesChecked||0,goal:n.coverEscape||null},livestock:n.livestock_status||null,scouting:n.scoutPlanning?{checked:n.scoutPlanning.checked,total:n.scoutPlanning.goals.length,landmark:n.scoutLandmark||null}:null,night_seen:!!n.nightSeen,sleep:n.sleep?{status:n.sleep.status,night_seen:!!n.sleep.night_seen,morning_seen:!!n.sleep.morning_seen,watch_seconds_left:n.sleep.watch_seconds_left,watch_seconds_total:n.sleep.watch_seconds_total,watch_updated_at:n.sleep.watch_updated_at}:null,exploration:n.exploration?.snapshot(t.last||{x:0,z:0},t.plot),memory:n.memory.snapshot()}:null;}
module.exports={enabled,handles,init,priority,interrupt,explore,tick,report,approaches,meals,RAW,FOOD};

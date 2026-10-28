// Small explicit survival planner. Skill policies still choose movement/harvesting.
const {Vec3}=require('vec3'),{WildernessMemory}=require('./wilderness_memory'),{standable,route}=require('./field_navigation'),{visibleBlock}=require('./target_scan'),inventory=require('./inventory_sync'),furnace=require('./furnace'),house=require('./house'),{closeDoor}=require('./door_care'),combat=require('./combat');
const livestock=require('./first_night_livestock');
const RAW={beef:'cooked_beef',porkchop:'cooked_porkchop',mutton:'cooked_mutton',chicken:'cooked_chicken',rabbit:'cooked_rabbit'},FOOD=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_rabbit','apple','bread'],ANIMALS=['cow','pig','sheep','chicken','rabbit'];
const SAFE_RAW=['beef','porkchop','mutton','rabbit'];
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','creeper','spider','cave_spider','witch','pillager','vindicator','enderman']);
const count=(b,n)=>b.inventory.items().filter(i=>i.name===n).reduce((s,i)=>s+i.count,0),meals=b=>FOOD.reduce((s,n)=>s+count(b,n),0),raw=b=>Object.keys(RAW).reduce((s,n)=>s+count(b,n),0);
const enabled=w=>w.mission==='first_night',handles=p=>p.startsWith('night_');
const inside=(p,b)=>p.x>b[0]+2&&p.x<b[1]-3&&p.z>b[2]+2&&p.z<b[3]-3;
function init(t,w){t.wilderness={memory:new WildernessMemory(w.memory||{}),priority:'Survey',reason:'Locate a safe home and nearby resources',searches:0,recoveries:0,foodConsumed:0,attacked:0};}
function priority(b,t,w){
 const n=t.wilderness,sheltered=t.milestones.includes('hut'),threat=Object.values(b.entities).find(e=>HOSTILES.has(e.name)&&e.isValid!==false&&e.position.distanceTo(b.entity.position)<10&&combat.visible(b,e));
 if(meals(b)&&b.food<=16)return {kind:'eat',reason:'Restore hunger before continuing'};
 if(b.food<=10&&SAFE_RAW.some(name=>count(b,name)))return {kind:'eat raw',reason:'Emergency food while cooking is unavailable'};
 if(sheltered&&(b.health<12||threat))return {kind:'retreat',reason:threat?'Visible '+threat.name+' nearby':'Recover health inside the hut'};
 if(n.resume&&b.health>=18&&!threat)return {kind:'resume',reason:'Safe to continue the interrupted task'};
 return {kind:handles(t.phase)?t.phase.replace('night_','').replaceAll('_',' '):t.phase.replaceAll('_',' '),reason:sheltered?'Develop and provision the home':'Gather enough materials for a secure shelter'};
}
async function interrupt(t,b,motor,state){
 const n=t.wilderness,p=priority(b,t,state.world);n.priority=p.kind;n.reason=p.reason;
 const time=b.time?.timeOfDay;if(time>=13000&&time<23000)n.nightSeen=true;
 if(p.kind==='eat'||p.kind==='eat raw'){motor.pause();await inventory.equip(b,(p.kind==='eat'?FOOD:SAFE_RAW).find(n=>count(b,n)));await b.consume();n.foodConsumed++;t.lastProgress=Date.now();return true;}
 if(p.kind==='retreat'&&!['night_retreat','night_recover'].includes(t.phase)){n.resume=t.phase;n.recoveries++;t.phase='night_retreat';t.path=[];t.navigator.lastPlan=-Infinity;return true;}
 if(p.kind==='resume'&&['night_retreat','night_recover'].includes(t.phase)){t.phase=n.resume;delete n.resume;t.lastProgress=Date.now();return true;}
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
 if(n.searchGoal&&Math.hypot(n.searchGoal[0]-p.x,n.searchGoal[2]-p.z)<1){n.memory.visited.add(n.searchGoal.map(Math.floor).join(','));n.searchGoal=null;t.lastProgress=now;}
 if(!n.searchGoal){
  if(now<(n.searchPlanAt||0)){motor.pause();t.message='Checking the last survey before choosing another safe route';return;}n.searchPlanAt=now+2500;
  // A remembered landmark is often a solid trunk or ore block, not a walk
  // destination. Use its clear approach cells and leave search budget for new
  // ground; stale landmarks must not crowd every frontier out of the search.
  const known=n.memory.resources.filter(r=>r.kind===kind&&n.memory.available(r.position)&&!n.memory.visited.has(r.position.map(Math.floor).join(','))).sort((a,c)=>new Vec3(...a.position).distanceTo(p)-new Vec3(...c.position).distanceTo(p)).flatMap(r=>approaches(b,{position:new Vec3(...r.position).floored()},bounds)).filter(g=>n.memory.available(g)&&!n.memory.visited.has(g.map(Math.floor).join(','))).slice(0,6);
  const candidates=[...known];const offset=(state.world.index||0)*Math.PI/4;
  for(const radius of [8,16,24,32])for(let i=0;i<8;i++){
   const a=offset+i*Math.PI/4,x=Math.floor(p.x+Math.cos(a)*radius),z=Math.floor(p.z+Math.sin(a)*radius),y=surface(b,x,z);if(y===null)continue;
   const goal=[x+.5,y+.1,z+.5];if(!inside(new Vec3(...goal),bounds)||!n.memory.available(goal)||n.memory.visited.has(goal.map(Math.floor).join(',')))continue;candidates.push(goal);
  }
  n.searchGoal=candidates.slice(0,18).find(goal=>route(b,goal,48,1024,true,{bounds,reversible:true}).reached);
  if(!n.searchGoal){motor.pause();t.message='No safe unexplored approach to '+kind+' in loaded terrain';n.noResourceAt??=now;if(now-n.noResourceAt>20000){t.failureCategory='resource_unavailable';throw Error('No reachable '+kind+' found after surveying loaded terrain');}return;}
  n.searches++;delete n.noResourceAt;
 }
 t.message='Scouting '+kind+' · remembering a safe return route';
 const moved=await t.walk(b,motor,n.searchGoal,state,api,scan,tasks);
 if(moved===false){n.memory.reject(n.searchGoal);n.searchGoal=null;n.recoveries++;}
}
async function tick(t,b,motor,state,api,scan,tasks,surface){
 const w=state.world,n=t.wilderness,now=Date.now(),p=b.entity.position,home=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],door=()=>b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));
 const next=phase=>{t.phase='night_'+phase;t.lastProgress=Date.now();n.searchGoal=null;};
 const move=async(goal,phase)=>{if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){motor.pause();next(phase);}};
 // Resource searches start outside. Otherwise line-of-sight and the closed
 // doorway correctly reject every outdoor candidate before a route is chosen.
 if(['night_stone','night_food','night_wool','night_forage','night_scout','night_fuel'].includes(t.phase)&&(n.leaving||require('./world_navigation').insideHome(p,t.plot))){
  n.leaving=true;if(await t.walk(b,motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z-4.5],state,api,scan,tasks)===true)n.leaving=false;t.message='Leaving the hut to search for resources';return;
 }
 if(t.phase==='night_bootstrap'){
  const pos=house.point(t.plot,'table');t.message='Making an axe early to speed up shelter harvesting';
  // Leave a body-width margin from the new table, even at the accepted
  // edge of the approach radius. The old radius allowed self-collision.
  const stance=new Vec3(pos.x+1.8,pos.y+.1,pos.z+.5),ready=()=>b.entity.position.distanceTo(stance)<=.42;
  if(!ready()){await t.walk(b,motor,[stance.x,stance.y,stance.z],state,api,scan,tasks);return;}
  motor.pause();
  if(b.entity.onGround===false||Math.hypot(b.entity.velocity?.x||0,b.entity.velocity?.z||0)>.025){t.message='Stopping at a clear workbench-building stance';return;}
  for(const item of [...b.inventory.items()].filter(i=>i.name.endsWith('_log')))await t.craft(b,item.name.replace('_log','_planks'),item.count,null);
  if(!ready()){t.navigator.lastPlan=-Infinity;t.message='Rechecking the workbench stance after crafting';return;}
  if(b.blockAt(new Vec3(pos.x,pos.y,pos.z))?.name!=='crafting_table'){
   if(!count(b,'crafting_table'))await t.craft(b,'crafting_table',1,null);
   try{await t.place(b,pos,'crafting_table');}catch(error){if(!String(error.message).includes('Server refused')||(n.bootstrapRetries=(n.bootstrapRetries||0)+1)>=3)throw error;t.path=[];t.navigator.lastPlan=-Infinity;t.message='Workbench placement was obstructed; checking the close approach again';return;}
  }
  const table=b.blockAt(new Vec3(pos.x,pos.y,pos.z));if(count(b,'stick')<2)await t.craft(b,'stick',1,null);
  if(!count(b,'wooden_axe'))await t.craft(b,'wooden_axe',1,table);await inventory.equip(b,'wooden_axe');t.table=pos;n.bootstrap=true;t.phase='gather';t.lastProgress=Date.now();
 }else if(t.phase==='night_stone'){
  if(count(b,'cobblestone')>=16){t.milestone('quarry');next('fuel');return;}
  if(!n.stoneScan||now-n.stoneScan>2500){n.stoneScan=now;n.stones=b.findBlocks({matching:b.registry.blocksByName.stone.id,maxDistance:40,count:80}).map(q=>b.blockAt(q)).filter(q=>q&&inside(q.position,w.bounds)&&q.position.y>=p.y-1&&q.position.y<=p.y+3&&visibleBlock(b,q)&&!(Math.floor(p.x)===q.position.x&&Math.floor(p.z)===q.position.z));}
  if(await pickup(t,b,motor,state,api,scan,tasks,['cobblestone']))return;
  const candidates=(n.stones||[]).filter(q=>b.blockAt(q.position)?.name==='stone'&&n.memory.available([q.position.x,q.position.y,q.position.z])&&!require('./resource_space').busy(b,state.run,q.position)).sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p));
  const target=candidates.find(q=>q.position.offset(.5,.5,.5).distanceTo(p.offset(0,1.62,0))<4&&b.canDigBlock(q)&&q.position.y>=Math.floor(p.y)&&visibleBlock(b,q));
  if(target){n.memory.remember('stone',target.position);t.harvestTarget=target.position;await t.harvest(b,motor,target.position,state,api,scan,tasks,'wooden_pickaxe');n.stoneScan=0;}
  else{
   let chosen=n.stoneApproach;
   if(chosen&&(!candidates.some(q=>q.position.equals(chosen.q.position))||!standable(b,Math.floor(chosen.goal[0]),Math.round(chosen.goal[1]),Math.floor(chosen.goal[2]))))chosen=null;
   if(!chosen&&now>=(n.stonePlanAt||0)){
    n.stonePlanAt=now+2000;for(const q of candidates.slice(0,6)){const goal=approaches(b,q,w.bounds).sort((a,c)=>new Vec3(...a).distanceTo(p)-new Vec3(...c).distanceTo(p)).slice(0,2).find(g=>route(b,g,48,1024,true,{bounds:w.bounds,reversible:true}).reached);if(goal){chosen={q,goal};break;}}n.stoneApproach=chosen;
   }
   if(chosen){n.memory.remember('stone',chosen.q.position);const arrived=await t.walk(b,motor,chosen.goal,state,api,scan,tasks);if(arrived===true||arrived===false){n.memory.reject([chosen.q.position.x,chosen.q.position.y,chosen.q.position.z]);n.stoneScan=0;n.stoneApproach=null;}}
   else await explore(t,b,motor,state,api,scan,tasks,surface,'stone');
  }t.message=t.message||`Natural stone ${count(b,'cobblestone')} / 16`;
 }else if(t.phase==='night_fuel'){
  if(b.inventory.items().filter(i=>i.name.endsWith('_log')).reduce((s,i)=>s+i.count,0)>=4){t.phase='stone_return';t.lastProgress=now;}
  else{n.fuelTrip=true;t.supplyRun=true;t.grove=null;t.resourceAt=0;t.phase='gather';}
 }else if(t.phase==='night_food'||t.phase==='night_wool'||t.phase==='night_forage'){
  const wool=t.phase==='night_wool';livestock.observe(t,b,w);
  // Keep bed material dropped during food hunting before leaving to cook.
  if(!wool&&t.phase!=='night_forage'&&count(b,'white_wool')<3&&await pickup(t,b,motor,state,api,scan,tasks,['white_wool']))return;
  if(t.phase==='night_forage'&&(SAFE_RAW.reduce((s,name)=>s+count(b,name),0)>=2||meals(b)>=2)){t.phase=n.forageResume||'night_food';delete n.forageResume;t.lastProgress=now;return;}
  if(t.phase!=='night_forage'&&(wool?count(b,'white_wool')>=3:meals(b)+raw(b)>=4)){t.milestone(wool?'wool':'food_found');next(wool?'wool_home':'food_home');return;}
  if(await pickup(t,b,motor,state,api,scan,tasks,wool?['white_wool']:Object.keys(RAW).concat(FOOD)))return;
  const foods=Object.values(b.entities).filter(e=>e.isValid!==false&&(!w.first_night.stations||JSON.stringify(e.metadata?.[2]||'').includes('FirstNight'+b.username))&&(wool?livestock.whiteSheep(b,e):ANIMALS.includes(e.name)&&(t.phase!=='night_forage'||e.name!=='chicken')&&(!w.first_night.stations||e.name!=='sheep'||count(b,'white_wool')>=3||b.food<=10))&&inside(e.position,w.bounds)&&e.position.distanceTo(p)<40&&!require('./resource_space').busy(b,state.run,e.position)&&n.memory.available([e.position.x,e.position.y,e.position.z]));
  let animal=foods.find(e=>e.id===n.animal)||foods.filter(e=>combat.visible(b,e)).sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p))[0];
  if(animal){delete n.noResourceAt;if(n.animal!==animal.id){n.animalGoal=null;n.animalPlanAt=0;}n.animal=animal.id;n.memory.remember('food',animal.position);if(livestock.whiteSheep(b,animal))n.memory.remember('wool',animal.position);const distance=animal.position.distanceTo(p);
   if(distance>2.7||!combat.visible(b,animal)){
    if(!n.animalGoal||now>=(n.animalPlanAt||0)){n.animalPlanAt=now+1000;n.animalGoal=approaches(b,{position:animal.position.floored()},w.bounds).sort((a,c)=>new Vec3(...a).distanceTo(p)-new Vec3(...c).distanceTo(p)).slice(0,3).find(g=>route(b,g,48,1024,true,{bounds:w.bounds,reversible:true}).reached);}
    const goal=n.animalGoal;
    if(goal){if(await t.walk(b,motor,goal,state,api,scan,tasks)===false)n.memory.reject([animal.position.x,animal.position.y,animal.position.z]);}else{n.memory.reject([animal.position.x,animal.position.y,animal.position.z]);n.animal=null;}
   }else{
    const task={kind:'combat',mobs:[animal.name],mob_label:w.first_night.stations?'FirstNight'+b.username:'',target_id:animal.id,bounds:w.bounds,min_y:-60,max_y:190,weapon:count(b,'stone_axe')?'stone_axe':'wooden_axe',kill_target:1,stationary:false,attack_delay_ms:1000,safe_walk:true,strict_ground:true};
    const runtime=n.combat||=( {} ),sensed=combat.observe(b,task,runtime),rays=scan(b),obs=[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0,...sensed.extra];
    const result=await api('/step',{agent:b.username,run:state.run,world_skill:'combat',obs,teacher:combat.teacher(sensed,task),reward:0,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:rays.hits,perception_ms:0,steps:0,goal:[animal.position.x,animal.position.y,animal.position.z],task:'combat',metrics:sensed.metrics});
    motor.command(result.action,task,{...sensed,...rays.proximity},sensed.angle);
    if([4,5,6].includes(result.action)&&await combat.interact(b,task,sensed,runtime,result.action,{combat_practice:true})&&result.action===6){n.attacked++;t.lastProgress=now;}
   }
   t.message=wool?'Collecting white wool · '+count(b,'white_wool')+' / 3':'Gathering food · '+(meals(b)+raw(b))+' / 4 meals · '+animal.name;
  }else if(!await livestock.support(t,b,motor,state,api,scan,tasks,wool?'wool':'food'))await explore(t,b,motor,state,api,scan,tasks,surface,wool?'wool':'food');
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
  const landmarks=n.memory.resources.filter(r=>r.kind==='wood'||r.kind==='stone').filter(r=>Math.hypot(r.position[0]-home[0],r.position[2]-home[2])>=8);
  if(!n.scoutGoal){
   const goals=landmarks.flatMap(r=>approaches(b,{position:new Vec3(...r.position).floored()},w.bounds));
   n.scoutGoal=goals.find(g=>route(b,g,48,4096,true,{bounds:w.bounds,reversible:true}).reached);
   if(!n.scoutGoal){await explore(t,b,motor,state,api,scan,tasks,surface,'wood');return;}
  }
  t.message='Revisit a remembered resource, then navigate home';await move(n.scoutGoal,'scout_home');
 }else if(t.phase==='night_scout_home'){await move(home,'hold');if(t.phase==='night_hold'){t.milestone('round_trip');n.holdAt=now;}}
 else if(t.phase==='night_retreat')await move(home,'recover');
 else if(t.phase==='night_recover'){
  motor.pause();const d=door();if(d?.getProperties().open&&!await closeDoor(b,d))return;t.message='Sheltered recovery · health '+b.health+' / 20';
  if(!meals(b)&&b.food<10){t.failureCategory='food_exhausted';throw Error('Insufficient food to recover safely');}
 }else if(t.phase==='night_hold'){
  motor.pause();const d=door();if(d?.getProperties().open){await closeDoor(b,d);return;}
  if(!d?.name.endsWith('_door')||d.getProperties().open!==false)throw Error('Shelter door did not verify closed');
  if(!require('./hut_teacher').intact(b,t.plot))throw Error('Shelter enclosure no longer intact');
  n.holdAt??=now;const elapsed=w.first_night.hostiles?(now-t.started)/1000:(now-n.holdAt)/1000,left=Math.max(0,Math.ceil(w.first_night.hold_seconds-elapsed));
  t.message=`Shelter watch · ${left} s left · health ${b.health} · food ${b.food} · ${meals(b)} meals`;
  if(meals(b)<1&&b.food<16){next('food');return;}
  if(left===0&&b.health>=12&&b.food>=10&&(!w.first_night.hostiles||n.nightSeen)){t.milestone('survived');t.phase='complete';t.message='First Night complete: provisioned, illuminated shelter, bed home, remembered resource round trip and safe survival watch';}
 }
}
function report(t){const n=t.wilderness;return n?{priority:n.priority,reason:n.reason,searches:n.searches,recoveries:n.recoveries,food_consumed:n.foodConsumed,livestock:n.livestock_status||null,night_seen:!!n.nightSeen,memory:n.memory.snapshot()}:null;}
module.exports={enabled,handles,init,priority,interrupt,explore,tick,report,approaches,meals,RAW,FOOD};

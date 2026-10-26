// Survival composition: policy navigation/mining/combat, verified recipe helpers.
const {Vec3}=require('vec3'),inventory=require('./inventory_sync'),furnace=require('./furnace'),settlement=require('./settlement'),combat=require('./combat'),{harvestable}=require('./resource_target'),{closeDoor}=require('./door_care'),{aim}=require('./harvest');
const advanced=m=>['iron_age','homestead','home_defense'].includes(m),handles=p=>p.startsWith('survival_');
const count=(b,name)=>b.inventory.items().filter(i=>i.name===name).reduce((n,i)=>n+i.count,0);
const table=(t,b)=>b.blockAt(new Vec3(t.table.x,t.table.y,t.table.z));
const hearth=(t,b)=>b.blockAt(new Vec3(t.plot.x-1,t.plot.y,t.plot.z+1));
const homeGoal=t=>t.home?[t.home.position[0]-.5,t.home.position[1]+.1,t.home.position[2]+1.5]:[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5];
const near=(b,g,r=.55)=>Math.hypot(b.entity.position.x-g[0],b.entity.position.z-g[2])<r&&Math.abs(b.entity.position.y-g[1])<.5;
const defenseTask=(t,w,s)=>({kind:'combat',bounds:w.bounds,min_y:t.plot.y-2,max_y:t.plot.y+4,mobs:['husk'],mob_label:s.threat.label,weapon:'iron_sword',armor:'iron',kill_target:1,stationary:false,min_health:10});
const MESSAGES={setup:'Preparing the iron expedition',wood_trip:'Heading to reserved wood',wood_craft:'Crafting supplies for tools and a bed',mine_enter:'Heading to the mine entrance',mine_down:'Descending the mine staircase',mine_up:'Climbing back to the surface',mine_return:'Returning home with ore',iron_tools:'Crafting iron tools, shears and sword',sheep_trip:'Heading to the lesson sheep',bed_return:'Returning home with wool',bed:'Crafting and verifying the bed home',food_trip:'Heading to the lesson livestock',food_return:'Bringing food home',armor:'Crafting and equipping iron armor',store:'Storing cooked food and spare iron',patrol:'Leaving home for defense practice',threat:'Preparing the controlled monster encounter',shelter:'Retreating inside the hut',secure:'Closing and verifying the home door',defend_exit:'Meeting the threat at the doorway',defense_return:'Returning safely to the bed home',finish:'Verifying the finished homestead'};
function itemName(b,e){try{const key=b.registry.entitiesByName.item.metadataKeys.indexOf('item');return require('prismarine-item')(b.registry).fromNotch(e.metadata?.[key])?.name;}catch{return null;}}
function lessonAnimal(b,label,mob){return Object.values(b.entities).filter(e=>e.name===mob&&JSON.stringify(e.metadata?.[2]||'').includes(label)).sort((a,c)=>a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position))[0];}
async function tick(t,b,motor,state,api,scan,tasks){
 const w=state.world,now=Date.now(),request=(action,more={})=>api('/world/survival',{agent:b.username,run:state.run,action,...more});
 t.message=MESSAGES[t.phase.replace('survival_','')]||'Survival lesson';
 const next=phase=>{t.phase='survival_'+phase;t.lastProgress=Date.now();};
 const move=async(goal,phase)=>{
  const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-2)),p=b.entity.position;
  if(door?.name.endsWith('_door')&&!door.getProperties().open&&p.distanceTo(door.position)<3.5&&((p.z>door.position.z+.5)!==(goal[2]>door.position.z+.5))){motor.pause();await b.activateBlock(door);return;}
  if(near(b,goal)||await t.walk(b,motor,goal,state,api,scan,tasks)===true){motor.pause();next(phase);}
 };
 const gather=async(blocks,item,amount,tool,phase)=>{
  t.message=`${item.replaceAll('_',' ')} ${count(b,item)} / ${amount}`;
  const ignored=(t.survival.ignoredItems||=new Map());
  const drop=Object.values(b.entities).filter(e=>e.name==='item'&&itemName(b,e)===item&&e.position.distanceTo(b.entity.position)<12&&Math.abs(e.position.y-b.entity.position.y)<1.7&&now>(ignored.get(e.id)||0)).sort((a,c)=>a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position))[0];
  const collect=async()=>{if(drop.position.distanceTo(b.entity.position)<1)motor.pause();else if(await t.walk(b,motor,[drop.position.x,drop.position.y,drop.position.z],state,api,scan,tasks)===false)ignored.set(drop.id,Date.now()+5000);};
  if(count(b,item)>=amount){if(item==='coal'||item==='raw_iron')t.milestone(item==='coal'?'coal':'iron_ore');motor.pause();next(phase);return;}
  const remaining=blocks.map(q=>b.blockAt(new Vec3(...q))).filter(q=>q&&['coal_ore','iron_ore','oak_log'].includes(q.name));
  const target=remaining.find(q=>harvestable(b,q.position));
  if(drop&&drop.position.distanceTo(b.entity.position)<4)await collect();
  else if(target){t.harvestTarget=target.position;await t.harvest(b,motor,target.position,state,api,scan,tasks,tool);}
  else if(drop)await collect();
  else if(remaining.length){
   const q=remaining.sort((a,c)=>a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position))[0],s=t.survival.station;
   const goal=item==='oak_log'?[q.position.x-1.5,t.plot.y+.1,q.position.z+.5]:item==='coal'?[q.position.x+1.5,s.bottom[1],q.position.z+.5]:[q.position.x+.5,s.bottom[1],s.bottom[2]];
   if(await t.walk(b,motor,goal,state,api,scan,tasks)===true&&!harvestable(b,q.position))throw Error('Resource face is obstructed; refusing to dig an unsafe approach');
  }else{motor.pause();await inventory.sync(b);const misses=(t.survival.resourceMiss||={});misses[item]??=Date.now();if(Date.now()-misses[item]>5000)throw Error('Lesson resource drops are missing; retry from a restored station');}
 };
 const s=t.survival;
 if(t.phase==='survival_setup'){
  motor.pause();t.survival={station:await request('station'),smelted:0,combat:{},sheared:new Set()};next('wood_trip');t.message='Iron expedition: descend the marked staircase, gather coal and iron, then climb home';
 }else if(t.phase==='survival_wood_trip')await move([s.station.logs[0][0]-1.5,t.plot.y+.1,s.station.logs[0][2]+.5],'wood');
 else if(t.phase==='survival_wood')await gather(s.station.logs,'oak_log',2,'stone_axe','wood_craft');
 else if(t.phase==='survival_wood_craft'){motor.pause();await t.craft(b,'oak_planks',2,null);next('mine_enter');}
 else if(t.phase==='survival_mine_enter')await move(s.station.entrance,'mine_down');
 else if(t.phase==='survival_mine_down'){await move(s.station.bottom,'coal');if(t.phase==='survival_coal')t.milestone('mine_descent');}
 else if(t.phase==='survival_coal')await gather(s.station.coal,'coal',6,'stone_pickaxe','iron');
 else if(t.phase==='survival_iron')await gather(s.station.ores,'raw_iron',s.station.iron_target,'stone_pickaxe','mine_up');
 else if(t.phase==='survival_mine_up')await move(s.station.entrance,'mine_return');
 else if(t.phase==='survival_mine_return'){await move(homeGoal(t),'iron_smelt');if(t.phase==='survival_iron_smelt')t.milestone('mine_return');}
 else if(t.phase==='survival_iron_smelt'){
  motor.pause();t.timing.mark(t.phase,'smelting');t.message=`Smelting iron ${s.smelted} / ${s.station.iron_target}; furnace takes about 10 seconds per ingot`;
  if(s.smelted>=s.station.iron_target&&count(b,'iron_ingot')>=s.station.iron_target){t.milestone('iron_smelt');next('iron_tools');}
  else if(count(b,'raw_iron')){await furnace.smelt(b,hearth(t,b),'raw_iron','iron_ingot',n=>n==='coal');await inventory.sync(b);s.smelted++;t.lastProgress=Date.now();}
  else throw Error('Iron smelting output did not match harvested ore');
 }else if(t.phase==='survival_iron_tools'){
  motor.pause();const tool=['iron_pickaxe','shears','iron_sword'].find(n=>!count(b,n));
  if(tool){if(tool!=='shears'&&count(b,'stick')<2){if(!b.inventory.items().some(i=>i.name.endsWith('_planks')))throw Error('No planks left for iron tool handles');await t.craft(b,'stick',1,null);}await t.craft(b,tool,1,table(t,b));t.milestone(tool);t.lastProgress=Date.now();}
  else if(w.mission==='iron_age'){await inventory.equip(b,'iron_pickaxe');t.phase='complete';t.message='Iron expedition complete: mined below camp, climbed home, smelted iron and crafted pickaxe, shears and sword';}
  else next('sheep_trip');
 }else if(t.phase==='survival_sheep_trip')await move(s.station.animals,'wool');
 else if(t.phase==='survival_wool'){
  t.message=`Shearing wool ${count(b,'white_wool')} / 3`;
  if(count(b,'white_wool')>=3){t.milestone('wool');next('bed_return');}
  else{
   const drops=Object.values(b.entities).filter(e=>e.name==='item'&&itemName(b,e)==='white_wool'&&Math.abs(e.position.y-b.entity.position.y)<1.7&&e.position.distanceTo(b.entity.position)<10);
   const sheep=Object.values(b.entities).filter(e=>e.name==='sheep'&&!s.sheared.has(e.id)&&JSON.stringify(e.metadata?.[2]||'').includes(s.station.animal_label))[0];
   if(drops.length){const p=drops[0].position;await t.walk(b,motor,[p.x,p.y,p.z],state,api,scan,tasks);}
   else if(sheep){if(sheep.position.distanceTo(b.entity.position)>2.5)await t.walk(b,motor,[sheep.position.x-1,sheep.position.y,sheep.position.z],state,api,scan,tasks);else{motor.pause();await inventory.equip(b,'shears');await aim(b,sheep.position.offset(0,.8,0));b.activateEntity(sheep);s.sheared.add(sheep.id);}}
   else{motor.pause();if(now-(s.woolWait||=now)>5000)throw Error('Shearing did not yield the required wool');}
  }
 }else if(t.phase==='survival_bed_return')await move(homeGoal(t),'bed');
 else if(t.phase==='survival_bed'){
  motor.pause();await inventory.sync(b);if(!count(b,'white_bed'))await t.craft(b,'white_bed',1,table(t,b));
  const foot=new Vec3(t.plot.x+1,t.plot.y,t.plot.z-1),head=foot.offset(0,0,1);
  if(b.blockAt(foot)?.name!=='white_bed'){
   if(b.blockAt(head)?.name!=='air')throw Error('Bed head space is obstructed');
   await inventory.equip(b,'white_bed');await b.look(Math.PI,0,true);await new Promise(r=>setTimeout(r,100));await b._placeBlockWithOptions(b.blockAt(foot.offset(0,-1,0)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});
  }
  for(let i=0;i<40&&(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(head)?.name!=='white_bed');i++)await new Promise(r=>setTimeout(r,25));
  if(b.blockAt(foot)?.name!=='white_bed'||b.blockAt(head)?.name!=='white_bed')throw Error('Both bed blocks must verify before setting home');
  t.home=await request('home',{position:[foot.x,foot.y,foot.z]});t.milestone('bed_home');next('food_trip');t.message='Bed verified: home registered and marked above the bed';
 }else if(t.phase==='survival_food_trip')await move(s.station.animals,'food');
 else if(t.phase==='survival_food'){
  t.message=`Obtaining food ${count(b,'beef')} / 2`;
  if(count(b,'beef')>=2){t.milestone('food');next('food_return');}
  else{
   const cow=lessonAnimal(b,s.station.animal_label,'cow'),drop=Object.values(b.entities).find(e=>e.name==='item'&&itemName(b,e)==='beef');
   if(drop){await t.walk(b,motor,[drop.position.x,drop.position.y,drop.position.z],state,api,scan,tasks);}
   else if(cow){if(cow.position.distanceTo(b.entity.position)>2.7)await t.walk(b,motor,[cow.position.x-1,cow.position.y,cow.position.z],state,api,scan,tasks);else{motor.pause();await inventory.equip(b,'iron_sword');await aim(b,cow.position.offset(0,.8,0));if(now-(s.lastAttack||0)>700){b.attack(cow);s.lastAttack=now;}}}
   else{motor.pause();if(now-(s.foodWait||=now)>5000)throw Error('Food drops missing from livestock lesson');}
  }
 }else if(t.phase==='survival_food_return')await move(homeGoal(t),'cook');
 else if(t.phase==='survival_cook'){
  motor.pause();t.timing.mark(t.phase,'smelting');t.message='Cooking food in the furnace';
  if(count(b,'cooked_beef')<2){await furnace.smelt(b,hearth(t,b),'beef','cooked_beef',n=>n==='coal');await inventory.sync(b);t.lastProgress=Date.now();}
  else{t.milestone('cooked');next('armor');}
 }else if(t.phase==='survival_armor'){
  motor.pause();const parts=[['iron_helmet','head',5],['iron_chestplate','torso',6],['iron_leggings','legs',7],['iron_boots','feet',8]],part=parts.find(([name,,slot])=>b.inventory.slots[slot]?.name!==name);
  if(part){const [name,destination]=part;if(!count(b,name))await t.craft(b,name,1,table(t,b));await b.equip(b.inventory.items().find(i=>i.name===name),destination);await inventory.sync(b);t.lastProgress=Date.now();}
  else{t.milestone('armor');next('store');}
 }else if(t.phase==='survival_store'){
  motor.pause();const chest=b.blockAt(settlement.chestPosition(t.plot));
  await settlement.stockChest(b,chest,1,n=>n==='cooked_beef');await settlement.stockChest(b,chest,1,n=>n==='iron_ingot');t.milestone('provisions');
  if(b.food<18&&count(b,'cooked_beef')){await inventory.equip(b,'cooked_beef');await b.consume();}
  await inventory.equip(b,'iron_sword');next(w.mission==='home_defense'?'patrol':'finish');
 }else if(t.phase==='survival_patrol')await move([t.plot.x+.5,t.plot.y+.1,t.plot.z-3.5],'threat');
 else if(t.phase==='survival_threat'){
  motor.pause();s.threat=await request('threat');s.threatAt=now;next('shelter');t.message='Controlled home defense: retreat inside and close the door';
 }else if(t.phase==='survival_retreat'){
  // First leave the threshold, then return while the tagged threat is present.
  const goal=[t.plot.x+.5,t.plot.y+.1,t.plot.z-3.5];await move(goal,'shelter');
 }else if(t.phase==='survival_shelter'){
  await move(homeGoal(t),'secure');
 }else if(t.phase==='survival_secure'){
  motor.pause();const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-2));if(door?.getProperties().open&&!await closeDoor(b,door))return;
  if(!door||b.blockAt(door.position)?.getProperties().open!==false)throw Error('Home door failed to secure');t.milestone('retreat');s.secureAt=now;next('defend_exit');
 }else if(t.phase==='survival_defend_exit'){
  const sensed=combat.observe(b,defenseTask(t,w,s),s.combat||{});
  if(sensed.enemy&&sensed.distance<3&&sensed.sight){motor.pause();next('defend');}
  else await move([t.plot.x+.5,t.plot.y+.1,t.plot.z-3.5],'defend');
 }
 else if(t.phase==='survival_defend'){
  const task=defenseTask(t,w,s),runtime=s.combat;
  if(!s.deathListener){s.deathListener=e=>combat.death(e,task,runtime);b.on('entityDead',s.deathListener);}
  const sensed=combat.observe(b,task,runtime),rays=scan(b),p=b.entity.position;
  t.message=`Defending home: ${runtime.hits||0} hits, ${runtime.kills||0} / 1 threats defeated`;
  if(runtime.kills>=1){motor.pause();b.removeListener('entityDead',s.deathListener);s.deathListener=null;t.milestone('defended');next('defense_return');}
  else if(!sensed.enemy){motor.pause();if(now-s.threatAt>15000)throw Error('Controlled threat disappeared without a verified defeat');}
  else{
   const obs=[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0,...sensed.extra];
   const result=await api('/step',{agent:b.username,run:state.run,world_skill:'combat',obs,teacher:combat.teacher(sensed,task),reward:0,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:rays.hits,perception_ms:0,steps:0,goal:s.threat.spawn,task:'combat',metrics:sensed.metrics});
   motor.command(result.action,task,{...sensed,...rays.proximity},sensed.angle);if([4,5,6].includes(result.action))await combat.interact(b,task,sensed,runtime,result.action,{combat_practice:true});
  }
 }else if(t.phase==='survival_defense_return'){await move(homeGoal(t),'finish');if(t.phase==='survival_finish')t.milestone('home_safe');}
 else if(t.phase==='survival_finish'){
  motor.pause();const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-2));if(door?.getProperties().open&&!await closeDoor(b,door))return;
  if(!t.home||b.blockAt(new Vec3(...t.home.position))?.name!=='white_bed')throw Error('Registered bed home is missing');
  await request('cleanup');t.phase='complete';t.message='Survival homestead verified: bed home, iron equipment, cooked food and stocked storage'+(w.mission==='home_defense'?'; threat defeated and returned home':'');
 }
}
module.exports={advanced,handles,tick,near,lessonAnimal};

// Close hostile encounters reuse the combat specialist before a hut is available.
const combat=require('./combat');
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','witch','pillager','vindicator','spider','cave_spider','silverfish','endermite']);
const WEAPONS=['netherite_sword','diamond_sword','iron_sword','netherite_axe','diamond_axe','iron_axe','stone_axe','stone_sword','wooden_axe','wooden_sword','golden_axe','golden_sword'];
function target(t,b,w){
 if(require('./shelter_policy').wantsCover(b,w)||t.wilderness?.shelterWatch)return null;
 if(!w.first_night?.hostiles||b.isSleeping)return null;
 const bounds=w.bounds,p=b.entity.position;
 const enemies=Object.values(b.entities).filter(e=>e.isValid!==false&&HOSTILES.has(e.name)&&e.position&&e.position.x>bounds[0]&&e.position.x<bounds[1]&&e.position.z>bounds[2]&&e.position.z<bounds[3]&&e.position.distanceTo(p)<=4.5&&Date.now()>=(t.wilderness.defenseDeferred?.get(e.id)||0)&&combat.visible(b,e));
 return enemies.find(e=>e.id===t.wilderness.defense?.target_id)||enemies.sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p))[0]||null;
}
function pDistance(b,e){return b.entity.position.distanceTo(e.position);}
async function tick(t,b,motor,state,api,scan){
 if(!api||!scan)return false;
 const enemy=target(t,b,state.world);if(!enemy)return false;
 const runtime=t.wilderness.defense??={},items=b.inventory.items(),weapon=WEAPONS.find(name=>items.some(i=>i.name===name))||b.heldItem?.name;
 // No supplies are granted. Unprotected bots seek cover instead; eligible
 // combat still respects cooldown, range, line of sight and equipment gates.
 const minY=b.game?.minY??-64,maxY=minY+(b.game?.height??384)-1;
 const task={kind:'combat',mobs:[enemy.name],mob_label:'',target_id:enemy.id,bounds:state.world.bounds,min_y:minY,max_y:maxY,weapon,kill_target:1,critical_hits:false,safe_walk:true,strict_ground:true,avoid_players:true};
 const now=Date.now(),healthKey=b.registry?.entitiesByName?.[enemy.name]?.metadataKeys?.indexOf('health'),enemyHealth=healthKey>=0?enemy.metadata?.[healthKey]:undefined;
 if(runtime.target_id!==enemy.id){runtime.progressAt=now;runtime.bestDistance=Infinity;runtime.enemyHealth=undefined;}
 const distance=pDistance(b,enemy);
 if(distance<(runtime.bestDistance??Infinity)-.5||typeof enemyHealth==='number'&&enemyHealth<(runtime.enemyHealth??Infinity)){
  runtime.progressAt=now;runtime.bestDistance=distance;runtime.enemyHealth=enemyHealth;
 }
 runtime.target_id=enemy.id;
 if(now-(runtime.progressAt??now)>12000){
  (t.wilderness.defenseDeferred??=new Map()).set(enemy.id,now+15000);
  runtime.target_id=null;motor.pause();t.message='No effective combat progress; disengaging and reassessing route or cover';return false;
 }
 const sensed=combat.observe(b,task,runtime),rays=scan(b),p=b.entity.position;
 const obs=[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0,...sensed.extra];
 const reply=await api('/step',{agent:b.username,run:state.run,world_skill:'combat',obs,teacher:combat.teacher(sensed,task),reward:0,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:rays.hits,perception_ms:0,steps:0,goal:[enemy.position.x,enemy.position.y,enemy.position.z],task:'combat',metrics:sensed.metrics});
 const action=Number.isInteger(reply.action)&&reply.action>=0&&reply.action<7?reply.action:4;
 const proximity=rays.proximity||{},rearSafe=proximity.canWalk?.(b.entity.yaw+Math.PI,.7)===true;
 motor.command(action,task,{...sensed,...proximity,rearSafe},sensed.angle);
 if([4,5,6].includes(action)){
  if(action===5||action===6)motor.pause();
  if(await combat.interact(b,task,sensed,runtime,action,{combat_practice:true,jump:false})&&action===6)t.lastProgress=Date.now();
 }
 t.wilderness.priority='Defending';t.wilderness.reason=require('./shelter_policy').assess(b,state.world).reason;t.message='Defending against '+enemy.name+' · '+(sensed.gear.weapon?'combat action '+action:'equipping carried weapon');
 return true;
}
module.exports={target,tick};

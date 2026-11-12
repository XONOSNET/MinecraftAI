// Close hostile encounters reuse the combat specialist before a hut is available.
const combat=require('./combat');
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','witch','pillager','vindicator','spider','cave_spider','silverfish','endermite']);
const WEAPONS=['netherite_sword','diamond_sword','iron_sword','netherite_axe','diamond_axe','iron_axe','stone_axe','stone_sword','wooden_axe','wooden_sword','golden_axe','golden_sword'];
function target(t,b,w){
 const risk=require('./shelter_policy').assess(b,w,t);
 if(risk.mode==='cover'||t.wilderness?.shelterWatch)return null;
 if(!w.first_night?.hostiles||b.isSleeping)return null;
 const bounds=w.bounds,p=b.entity.position;
 const chosen=risk.engagement?.enemy;
 if(chosen&&chosen.position.x>bounds[0]&&chosen.position.x<bounds[1]&&chosen.position.z>bounds[2]&&chosen.position.z<bounds[3])return chosen;
 const enemies=Object.values(b.entities).filter(e=>e.isValid!==false&&HOSTILES.has(e.name)&&e.position&&e.position.x>bounds[0]&&e.position.x<bounds[1]&&e.position.z>bounds[2]&&e.position.z<bounds[3]&&e.position.distanceTo(p)<=4.5&&Date.now()>=(t.wilderness.defenseDeferred?.get(e.id)||0)&&combat.visible(b,e));
 return enemies.find(e=>e.id===t.wilderness.defense?.target_id)||enemies.sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p))[0]||null;
}
function disengage(t,b,reason){
 const n=t.wilderness,r=n.defense;
 if(r?.target_id==null)return;
 const now=Date.now(),deferred=n.defenseDeferred??=new Map();
 for(const [id,until] of deferred)if(now>=until)deferred.delete(id);
 deferred.set(r.target_id,now+(r.style?require('./shelter_work').rules.combat.reengage_ms:15000));
 r.target_id=null;r.retreats=(r.retreats||0)+1;r.retreatReason=reason;
 n.memory?.encounter(r.enemy,'retreat',b.entity.position);
 b.deactivateItem?.();
}
function pDistance(b,e){return b.entity.position.distanceTo(e.position);}
async function tick(t,b,motor,state,api,scan){
 if(!api||!scan)return false;
 const n=t.wilderness,enemy=target(t,b,state.world);
 if(!enemy){
  if(n.defense?.target_id!=null&&Date.now()-n.defense.lastSeen>2000)disengage(t,b,'Lost sight of the target');
  return false;
 }
 const runtime=n.defense??={},items=b.inventory.items(),risk=require('./shelter_policy').assess(b,state.world,t);
 const readiness=risk.engagement,style=readiness?.style,weapon=readiness?.weapon||WEAPONS.find(name=>items.some(i=>i.name===name))||b.heldItem?.name;
 // No supplies are granted. Unprotected bots seek cover instead; eligible
 // combat still respects cooldown, range, line of sight and equipment gates.
 const minY=b.game?.minY??-64,maxY=minY+(b.game?.height??384)-1;
 const task={kind:'combat',mobs:[enemy.name],mob_label:'',target_id:enemy.id,bounds:state.world.bounds,min_y:minY,max_y:maxY,weapon,
  shield:!!style&&readiness.shield,kill_target:1,critical_hits:style==='melee',safe_walk:true,strict_ground:true,avoid_players:true};
 const now=Date.now(),healthKey=b.registry?.entitiesByName?.[enemy.name]?.metadataKeys?.indexOf('health'),enemyHealth=healthKey>=0?enemy.metadata?.[healthKey]:undefined;
 if(runtime.target_id!==enemy.id){
  runtime.progressAt=now;runtime.bestDistance=Infinity;runtime.enemyHealth=undefined;
  runtime.engagements=(runtime.engagements||0)+1;runtime.withdrawUntil=0;
 }
 const distance=pDistance(b,enemy);
 if(distance<(runtime.bestDistance??Infinity)-.5||typeof enemyHealth==='number'&&enemyHealth<(runtime.enemyHealth??Infinity)){
  runtime.progressAt=now;runtime.bestDistance=distance;runtime.enemyHealth=enemyHealth;
 }
 runtime.target_id=enemy.id;runtime.enemy=enemy.name;runtime.style=style;runtime.task=task;runtime.lastSeen=now;
 if(now-(runtime.progressAt??now)>12000){
  disengage(t,b,'No effective combat progress');motor.pause();t.message='No effective combat progress; disengaging and reassessing route or cover';return false;
 }
 const sensed=combat.observe(b,task,runtime),rays=scan(b),p=b.entity.position;
 const obs=[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),b.health/20,b.food/20,b.entity.onGround?1:0,...sensed.extra];
 const creeper=style==='creeper',mustBack=creeper&&(readiness.withdraw||now<runtime.withdrawUntil||distance<1.65);
 const keepRange=creeper&&distance<3.2&&sensed.cooldown>0;
 const aligned=Math.abs(sensed.angle)<=.22;
 const guard=rangedGuard(style,aligned,distance,sensed);
 const teacher=mustBack?(aligned?3:sensed.angle>0?1:2):keepRange?4:guard??combat.teacher(sensed,task);
 const reply=await api('/step',{agent:b.username,run:state.run,world_skill:'combat',obs,teacher,reward:0,position:[p.x,p.y,p.z],health:b.health,food:b.food,hits:rays.hits,perception_ms:0,steps:0,goal:[enemy.position.x,enemy.position.y,enemy.position.z],task:'combat',metrics:{...sensed.metrics,engagement_style:style||'close_defense'}});
 if(style&&(b.health<require('./shelter_work').rules.combat.min_health||b.food<require('./shelter_work').rules.combat.min_food)){
  disengage(t,b,'Health or hunger fell during the encounter');motor.pause();return true;
 }
 let action=Number.isInteger(reply.action)&&reply.action>=0&&reply.action<7?reply.action:4;
 if(creeper&&(mustBack||require('./combat_readiness').fuse(b,enemy))){task.retreat_only=true;action=aligned?3:sensed.angle>0?1:2;}
 else if(keepRange&&[0,6].includes(action))action=4;
 if(style&&action===0&&!aligned)action=sensed.angle>0?1:2;
 const proximity=rays.proximity||{},rearSafe=proximity.canWalk?.(b.entity.yaw+Math.PI,.7)===true;
 motor.command(action,task,{...sensed,...proximity,rearSafe},sensed.angle);
 if((style==='ranged'&&action===0||creeper&&action===3)&&sensed.gear.shield&&aligned){
  await b.lookAt(enemy.position.offset(0,.9,0),true);if(!b.usingHeldItem)b.activateItem(true);
 }else if(action===3||action===0||action===1||action===2)b.deactivateItem?.();
 if([4,5,6].includes(action)){
  if(action===5||action===6)motor.pause();
  if(await combat.interact(b,task,sensed,runtime,action,{combat_practice:true,jump:style==='melee'})&&action===6){
   t.lastProgress=Date.now();if(creeper)runtime.withdrawUntil=Date.now()+1100;
  }
 }
 t.wilderness.priority='Defending';t.wilderness.reason=risk.reason;t.message='Defending against '+enemy.name+' · '+(sensed.gear.weapon?'combat action '+action:'equipping carried weapon');
 return true;
}
function rangedGuard(style,aligned,distance,sensed){
 if(style!=='ranged'||!aligned||!sensed.gear.ready)return null;
 if(distance>2.7)return 0;
 return sensed.cooldown>0?4:null;
}
module.exports={target,tick,disengage};

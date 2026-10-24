// Bounded seven-action combat policy; teacher decisions and neural decisions use the same actuators.
const {Vec3}=require('vec3');
const LABELS=['Approaching monster','Aiming left','Aiming right','Backing away for spacing','Guarding / waiting for cooldown','Equipping combat gear','Attacking monster'];
const parts=[['helmet','head',5],['chestplate','torso',6],['leggings','legs',7],['boots','feet',8]];
function equipment(bot,task){
 const slots=bot.inventory.slots||[];
 const weapon=bot.heldItem?.name===task.weapon;
 const armor=task.armor?parts.filter(([part,,slot])=>slots[slot]?.name===`${task.armor}_${part}`).length/4:1;
 const shield=slots[45]?.name==='shield';return {weapon,armor,shield,ready:weapon&&armor===1&&(!task.shield||shield)};
}
function ownedTarget(entity,task){
 if(!entity?.position||!task.mobs.includes(entity.name)||entity.isValid===false)return false;
 const p=entity.position,b=task.bounds;
 return p.x>b[0]&&p.x<b[1]&&p.z>b[2]&&p.z<b[3]&&p.y>=179&&p.y<=186&&JSON.stringify(entity.metadata?.[2]||'').includes(task.mob_label);
}
function target(bot,task){return Object.values(bot.entities||{}).filter(e=>ownedTarget(e,task)).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position))[0]||null;}
function visible(bot,entity){
 if(!entity)return false;
 const eye=bot.entity.position.offset(0,1.62,0),aim=entity.position.offset(0,.9,0),delta=aim.minus(eye),distance=delta.norm();
 const hit=bot.world.raycast(eye,delta.scaled(1/Math.max(.001,distance)),distance);
 return !hit||eye.distanceTo(hit.intersect)>distance-.15;
}
function observe(bot,task,runtime,now=Date.now()){
 const enemy=target(bot,task),gear=equipment(bot,task),p=bot.entity.position;
 const distance=enemy?p.distanceTo(enemy.position):16;
 const bearing=enemy?Math.atan2(-(enemy.position.x-p.x),-(enemy.position.z-p.z)):bot.entity.yaw;
 const angle=Math.atan2(Math.sin(bearing-bot.entity.yaw),Math.cos(bearing-bot.entity.yaw));
 const sight=visible(bot,enemy),cooldown=Math.max(0,650-(now-(runtime.lastAttack||0)))/650;
 const remaining=Math.max(0,task.kill_target-(runtime.kills||0));
 const extra=[Number(!!enemy),Math.min(1,distance/16),Math.sin(angle),Math.cos(angle),Number(gear.weapon),gear.armor,cooldown,Number(sight),Number(distance<1.4),remaining/Math.max(1,task.kill_target),bot.health/20,Number(gear.shield)];
 return {enemy,gear,distance,angle,sight,cooldown,extra,metrics:{weapon_equipped:gear.weapon,armor_equipped:gear.armor===1,shield_equipped:gear.shield,kills:runtime.kills||0,hits:runtime.hits||0,kill_target:task.kill_target,enemy:enemy?.name||null,attack_cooldown:cooldown}};
}
function teacher(sensed,task){
 if(!sensed.gear.ready)return 5;
 if(!sensed.enemy)return 4;
 if(Math.abs(sensed.angle)>.12)return sensed.angle>0?1:2;
 if(!sensed.sight||sensed.distance>2.7)return 0;
 if(sensed.cooldown===0)return 6;
 if(sensed.distance<1.4&&!task.stationary)return 3;
 return 4;
}
function death(entity,task,runtime){
 if(!task||task.kind!=='combat'||!runtime.attacked?.has(entity.id))return;
 if(!ownedTarget(entity,task)||runtime.killed?.has(entity.id))return;
 (runtime.killed??=new Set()).add(entity.id);runtime.kills=(runtime.kills||0)+1;
}
async function interact(bot,task,sensed,runtime,action,permissions,now=Date.now()){
 if(!permissions.combat_practice)return false;
 const p=bot.entity.position,b=task.bounds;
 if(!(p.x>b[0]&&p.x<b[1]&&p.z>b[2]&&p.z<b[3]&&p.y>=179&&p.y<=186))return false;
 if(action!==4)bot.deactivateItem();
 if(action===5){
  const equip=async(name,slot)=>{const item=bot.inventory.items().find(i=>i.name===name);if(item)await bot.equip(item,slot);};
  if(task.armor)for(const [part,slot,index] of parts)if(bot.inventory.slots[index]?.name!==`${task.armor}_${part}`)await equip(`${task.armor}_${part}`,slot);
  if(task.shield&&bot.inventory.slots[45]?.name!=='shield')await equip('shield','off-hand');
  if(bot.heldItem?.name!==task.weapon)await equip(task.weapon,'hand');
  return true;
 }
 const enemy=sensed.enemy;
 if(!ownedTarget(enemy,task))return false;
 if(action===4&&equipment(bot,task).shield){await bot.lookAt(enemy.position.offset(0,.9,0),true);bot.activateItem(true);return true;}
 if(action!==6||bot.heldItem?.name!==task.weapon||bot.entity.position.distanceTo(enemy.position)>3||!visible(bot,enemy)||now-(runtime.lastAttack||0)<650)return false;
 await bot.lookAt(enemy.position.offset(0,.9,0),true);
 (runtime.attacked??=new Set()).add(enemy.id);runtime.lastAttack=now;runtime.hits=(runtime.hits||0)+1;
 bot.attack(enemy);return true;
}
function reached(task,m){return m.health>=task.min_health&&m.inside&&Math.abs(m.y-181)<1.5&&m.weapon_equipped&&m.armor_equipped&&(!task.shield||m.shield_equipped)&&m.kills>=task.kill_target&&(!task.kill_target||m.hits>=task.kill_target);}
module.exports={LABELS,equipment,ownedTarget,target,observe,teacher,death,interact,reached};

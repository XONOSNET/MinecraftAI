const {Vec3}=require('vec3'),{route}=require('./field_navigation');
const {rules,durable,usable}=require('./shelter_work');
const RANGED=new Set(['skeleton','stray','bogged','pillager']);
const ZOMBIES=new Set(['zombie','zombie_villager','husk','drowned']);
const WEAPONS=['netherite_sword','diamond_sword','iron_sword','netherite_axe','diamond_axe','iron_axe','stone_sword','stone_axe'];
function metadata(b,e,name){
 const index=b.registry?.entitiesByName?.[e.name]?.metadataKeys?.indexOf(name);
 return index>=0?e.metadata?.[index]:undefined;
}
function fuse(b,e){return metadata(b,e,'swell_dir')>0||metadata(b,e,'is_ignited')===true;}
function assess(b,t,w,enemies){
 const c=rules.combat,n=t?.wilderness;
 if(!rules.enabled||!c.equipped_engagements||!n||!b.blockAt||!w.bounds)return null;
 const worn=(b.inventory.slots||[]).slice(5,9).filter(i=>i&&durable(b,i)>3);
 const armor=worn.reduce((sum,i)=>sum+(/^(netherite|diamond)_/.test(i.name)?3:/^(iron|chainmail)_/.test(i.name)?2:1),0);
 const weapon=WEAPONS.find(name=>usable(b,name,null,8));
 const shield=usable(b,'shield',45,c.min_shield_durability),p=b.entity.position;
 const enemy=enemies.find(e=>RANGED.has(e.name)?e.position.distanceTo(p)<=18:
  (ZOMBIES.has(e.name)||e.name==='creeper')&&e.position.distanceTo(p)<=c.engagement_range);
 if(!enemy)return null;
 const distance=enemy.position.distanceTo(p),ranged=RANGED.has(enemy.name),creeper=enemy.name==='creeper';
 const threatened=enemies.filter(e=>e.position.distanceTo(p)<(RANGED.has(e.name)?18:12));
 if(n.defenseDeferred?.get(enemy.id)>Date.now())return {enemy,ready:false,reason:'Recent disengagement; waiting before reconsidering this enemy'};
 const learnedRisk=n.memory?.encounters?.some(x=>x.enemy===enemy.name&&['death','damage'].includes(x.outcome)&&
  p.distanceTo(new Vec3(...x.position))<6);
 const capable=b.health>=Math.min(20,c.min_health+(learnedRisk?2:0))&&b.food>=c.min_food&&
  worn.length>=(creeper?3:2)&&armor>=(ranged||creeper?6:4)&&weapon&&(!ranged&&!creeper||shield);
 if(!capable)return ranged||creeper||n.defense?.target_id===enemy.id?
  {enemy,ready:false,reason:'Health, food or equipment make this encounter unsafe'}:null;
 const nearStructures=(t.campPlots||[]).concat(t.plot||[]).some(h=>[p,enemy.position].some(v=>Math.hypot(v.x-h.x-.5,v.z-h.z-.5)<c.creeper_structure_distance));
 if(threatened.length!==1||creeper&&(nearStructures||metadata(b,enemy,'is_powered')===true||require('./shelter_policy').underground(b)))
  return {enemy,ready:false,reason:'Nearby enemies or structures make engagement unsafe'};
 if(distance>c.engagement_range)return {enemy,ready:false,reason:'Ranged threat beyond the checked engagement distance'};
 if(b.entity.isInWater||b.entity.isInLava||Math.abs(p.y-enemy.position.y)>1.4)
  return {enemy,ready:false,reason:'No checked ground for engagement'};
 const yaw=Math.atan2(-(enemy.position.x-p.x),-(enemy.position.z-p.z)),local=require('./perception').proximity(b,{recovery:false});
 const rear=local.canWalk(yaw+Math.PI,creeper?1.8:.9);
 if(!rear)return {enemy,ready:false,reason:'No clear withdrawal corridor behind the agent'};
 if(distance>4.5&&!require('./refuge_choice').homeReachable(t,b,w)&&!local.canWalk(yaw+Math.PI,2.5))
  return {enemy,ready:false,reason:'No checked shelter approach or extended escape corridor'};
 if(creeper&&fuse(b,enemy))return {enemy,ready:true,style:'creeper',weapon,shield,withdraw:true,reason:'Creeper swelling; retreat along checked ground'};
 if(distance>2.7){
  const goal=enemy.position.plus(p.minus(enemy.position).scaled(2.25/Math.max(distance,.01)));
  const cell=goal.floored(),key=[enemy.id,...p.floored().toArray(),...cell.toArray()].join(','),now=Date.now();
  const cached=n.engagementRoute;
  const reachable=cached?.key===key&&now-cached.at<750?cached.reachable:
   route(b,[cell.x+.5,cell.y+.1,cell.z+.5],12,512,true,{bounds:w.bounds,reversible:true}).reached;
  n.engagementRoute={key,at:now,reachable};
  if(!reachable||!local.canWalk(yaw,.75))return {enemy,ready:false,reason:'Approach is obstructed; using shelter or repositioning instead'};
 }
 return {enemy,ready:true,style:creeper?'creeper':ranged?'ranged':'melee',weapon,shield,
  reason:creeper?'Isolated creeper away from structures; hit and withdraw':ranged?'Armored and shielded with a checked approach':'Isolated hostile with a checked escape'};
}
module.exports={assess,metadata,fuse,RANGED};

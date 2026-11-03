// Only living, unowned mobs actually intersecting an unfinished block.
const {Vec3}=require('vec3'),house=require('./house'),combat=require('./combat');
function eligible(b,e){
 if(e.isValid===false||!e.position||e.type!=='mob'||e.name==='armor_stand'||['villager','wandering_trader','iron_golem','snow_golem'].includes(e.name))return false;
 const keys=b.registry?.entitiesByName?.[e.name]?.metadataKeys||[];
 if(e.customName||e.displayName&&e.displayName!==e.name&&e.metadata?.[2])return false;
 const owner=keys.findIndex(k=>/owner/i.test(k));if(owner>=0&&e.metadata?.[owner])return false;
 if(['wolf','cat','parrot','horse','donkey','mule','llama'].includes(e.name))return false;
 return true;
}
function intersects(e,q){const w=(e.width||.8)/2;return e.position.x+w>q.x&&e.position.x-w<q.x+1&&e.position.z+w>q.z&&e.position.z-w<q.z+1&&e.position.y+(e.height||1.8)>q.y&&e.position.y<q.y+1;}
async function tick(t,b,motor,state,api,scan,tasks){
 if(!['floor','build','door','table','clear_plot','home_repair'].includes(t.phase)||!t.plot)return false;
 const targets=house.blueprint(t.plot).filter(q=>{const v=b.blockAt(new Vec3(q.x,q.y,q.z));return v&&!(q.table?v.name==='crafting_table':v.name.endsWith('_planks'));});
 const enemy=Object.values(b.entities||{}).find(e=>eligible(b,e)&&targets.some(q=>intersects(e,q))&&e.position.distanceTo(b.entity.position)<7&&combat.visible(b,e));
 if(!enemy)return false;
 const r=t.buildBlocker??={};if(r.id!==enemy.id){r.id=enemy.id;r.at=Date.now();}
 if(Date.now()-r.at>15000){t.message='Construction animal moved out of reach; rechecking building angles';return false;}
 if(enemy.position.distanceTo(b.entity.position)>2.8){
  const p=enemy.position.floored(),nav=require('./field_navigation'),goals=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>[p.x+x+.5,p.y+.1,p.z+z+.5]);
  const goal=goals.find(g=>nav.standable(b,Math.floor(g[0]),Math.round(g[1]),Math.floor(g[2]))&&nav.route(b,g,12,512,true,{bounds:state.world.bounds,reversible:true}).reached);
  if(!goal)return false;await t.walk(b,motor,goal,state,api,scan,tasks);t.message='Approaching '+enemy.name+' blocking construction';return true;
 }
 motor.pause();const weapon=b.inventory.items().find(i=>/_(axe|sword)$/.test(i.name))?.name||b.heldItem?.name||'air';
 if(!b.heldItem&&weapon==='air'){if(Date.now()-(r.lastHit||0)>=700){await b.lookAt(enemy.position.offset(0,.5,0),true);b.attack(enemy);r.lastHit=Date.now();}}
 else{const task={kind:'combat',combat_style:'hunt',mobs:[enemy.name],mob_label:'',target_id:enemy.id,bounds:state.world.bounds,min_y:-64,max_y:320,weapon,auto_equip_for_attack:true,critical_hits:false};await combat.interact(b,task,{enemy},r,6,{combat_practice:true,jump:false});}
 t.message='Removing '+enemy.name+' blocking the building footprint';return true;
}
module.exports={eligible,intersects,tick};

// Short, visible pickup detours; never interrupt shelter, combat or mining exits.
const {Vec3}=require('vec3'),nav=require('./field_navigation'),space=require('./resource_space'),inventory=require('./inventory_sync'),{sapling}=require('./reforest');
const claims=new Map(),MATERIAL=new Set(['leather','coal','charcoal','raw_iron','iron_ingot','stick','cobblestone','white_wool','string','bone','arrow','torch','beef','porkchop','mutton','chicken','rabbit','cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_rabbit','apple','bread']);
function useful(name){return !!name&&(MATERIAL.has(name)||sapling(name)||/_(log|planks|sword|axe|pickaxe|shovel|helmet|chestplate|leggings|boots)$/.test(name)||['shield','bow','crossbow'].includes(name));}
function visible(b,e){const eye=b.entity.position.offset(0,1.62,0),delta=e.position.offset(0,.1,0).minus(eye),distance=delta.norm(),hit=b.world.raycast(eye,delta.scaled(1/Math.max(.01,distance)),distance);return !hit||hit.intersect&&eye.distanceTo(hit.intersect)>=distance-.2;}
async function tick(t,b,motor,state,api,scan,tasks){
 if(!t.wilderness||!['gather','night_stone','night_fuel','night_food','night_wool','night_scout','stone_return','return_home','leave_hut','night_food_home','night_wool_home'].includes(t.phase)||b.isSleeping||b.currentWindow||b.health<12||t.wilderness.burrow||t.resourceAccess?.column?.length||t.wilderness.mine&&!['done','approach'].includes(t.wilderness.mine.stage)||require('./shelter_policy').threats(b).length)return false;
 const now=Date.now(),p=b.entity.position,r=t.loot??={ignored:new Map(),next:0};
 for(const [k,v] of claims)if(v.until<now)claims.delete(k);
 const itemName=e=>require('./survival').itemName(b,e);
 if(r.target&&(!b.entities[r.target]||b.entities[r.target].isValid===false)){claims.delete(r.target);r.target=null;t.navigator.lastPlan=-Infinity;}
 if(!r.target){
  if(now<r.next)return false;r.next=now+1200;
  const drops=Object.values(b.entities||{}).filter(e=>e.name==='item'&&e.isValid!==false&&e.position.distanceTo(p)<=5&&useful(itemName(e))&&now>(r.ignored.get(e.id)||0)&&(!claims.has(e.id)||claims.get(e.id).owner===b.username)&&space.clearOfPlayers(b,e.position)&&visible(b,e)).sort((a,c)=>a.position.distanceTo(p)-c.position.distanceTo(p));
  for(const e of drops){
   const target=e.position.floored(),goals=[[target.x+.5,target.y+.1,target.z+.5],...[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>[target.x+x+.5,target.y+.1,target.z+z+.5])];
   const goal=goals.find(g=>new Vec3(...g).distanceTo(e.position)<1.4&&nav.standable(b,Math.floor(g[0]),Math.round(g[1]),Math.floor(g[2]))&&nav.route(b,g,12,512,true,{bounds:state.world.bounds,reversible:true}).reached);
   if(goal){r.target=e.id;r.goal=goal;r.started=now;claims.set(e.id,{owner:b.username,until:now+9000});break;}
  }
 }
 if(!r.target)return false;
 if(now-r.started>7000){r.ignored.set(r.target,now+30000);claims.delete(r.target);r.target=null;t.navigator.lastPlan=-Infinity;return false;}
 const drop=b.entities[r.target];if(!drop)return false;
 if(drop.position.distanceTo(p)<1.1){motor.pause();await inventory.sync(b);}else if(await t.walk(b,motor,r.goal,state,api,scan,tasks)===false){r.ignored.set(r.target,now+30000);claims.delete(r.target);r.target=null;return false;}
 t.message='Picking up useful dropped '+itemName(drop);return true;
}
module.exports={useful,tick};

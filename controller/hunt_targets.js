// Loaded animal selection is separate from remembered terrain/resource rejection.
const {Vec3}=require('vec3'),combat=require('./combat'),livestock=require('./first_night_livestock'),{route}=require('./field_navigation');
const claims=new Map(),animals=new Set(['cow','pig','sheep','chicken','rabbit']);
const key=(run,e)=>run+':'+(e.uuid||e.id);
function release(owner){for(const [id,c] of claims)if(c.owner===owner)claims.delete(id);}
function defer(n,b,e,now=Date.now()){
 n.rejectedAnimals??=new Map();n.rejectedAnimals.set(e.id,{until:now+8000,animal:e.position.clone(),bot:b.entity.position.clone()});
}
function deferred(n,b,e,now){
 const r=n.rejectedAnimals?.get(e.id);if(!r)return false;
 const until=typeof r==='number'?r:r.until;
 if(now>=until||(typeof r!=='number'&&(e.position.distanceTo(r.animal)>=2||b.entity.position.distanceTo(r.bot)>=3))){n.rejectedAnimals.delete(e.id);return false;}return true;
}
function choose(t,b,state,approaches,now=Date.now()){
 const n=t.wilderness,w=state.world,p=b.entity.position,wool=t.phase==='night_wool',skipped={};
 const skip=reason=>{skipped[reason]=(skipped[reason]||0)+1;};
 for(const [id,c] of claims)if(c.until<=now)claims.delete(id);
 for(const [id,r] of n.rejectedAnimals||[])if(now>=(typeof r==='number'?r:r.until))n.rejectedAnimals.delete(id);
 const loaded=Object.values(b.entities).filter(e=>e.isValid!==false&&animals.has(e.name)&&e.position.distanceTo(p)<40);
 const candidates=[];let white=0;
 for(const e of loaded){
  if(livestock.whiteSheep(b,e))white++;
  if(!livestock.owned(b,w,e)){skip('assigned to another bot');continue;}
  if(wool&&!livestock.whiteSheep(b,e)){skip(e.name==='sheep'?'not an adult unsheared white sheep':'not a sheep');continue;}
  if(!wool&&(t.phase==='night_forage'&&e.name==='chicken'||w.first_night.stations&&e.name==='sheep'&&b.food>10&&b.inventory.items().filter(i=>i.name==='white_wool').reduce((a,i)=>a+i.count,0)<3)){skip('reserved for wool');continue;}
  if(!(e.position.x>w.bounds[0]+2&&e.position.x<w.bounds[1]-3&&e.position.z>w.bounds[2]+2&&e.position.z<w.bounds[3]-3)){skip('outside training boundary');continue;}
  const claim=claims.get(key(state.run,e));if(claim&&claim.owner!==b.username){skip('being hunted by another bot');continue;}
  if(deferred(n,b,e,now)){skip('approach retry pending');continue;}
  const sight=combat.visible(b,e);if(!sight&&e.id!==n.animal){skip('no clear sightline');continue;}
  candidates.push({e,sight,distance:e.position.distanceTo(p)});
 }
 candidates.sort((a,c)=>a.distance-c.distance);
 const locked=candidates.find(c=>c.e.id===n.animal),nearest=candidates.find(c=>c.sight);
 // Keep a close active hunt stable; distant or hidden locks yield to a clearly
 // better visible opportunity. Small distance changes do not cause oscillation.
 if(locked&&(!nearest||nearest.e.id===locked.e.id||locked.sight&&(locked.distance<=6||nearest.distance>locked.distance*.6||locked.distance-nearest.distance<4))){candidates.splice(candidates.indexOf(locked),1);candidates.unshift(locked);}
 let selected=null,goal=null;
 for(const c of candidates.slice(0,3)){
  const e=c.e,local=c.distance<=4.5&&Math.abs(e.position.y-p.y)<=.6&&c.sight;
  if(local){selected=e;break;}
  const cached=n.huntApproach;
  if(cached?.id===e.id&&now-cached.at<750&&e.position.distanceTo(cached.animal)<.75&&p.distanceTo(cached.bot)<3){selected=e;goal=cached.goal;break;}
  goal=approaches(b,{position:e.position.floored()},w.bounds).sort((a,c)=>new Vec3(...a).distanceTo(p)-new Vec3(...c).distanceTo(p)).slice(0,3).find(g=>route(b,g,48,1024,true,{bounds:w.bounds,reversible:true}).reached);
  if(goal){selected=e;n.huntApproach={id:e.id,at:now,animal:e.position.clone(),bot:p.clone(),goal};break;}
  skip('no safe approach');defer(n,b,e,now);
 }
 release(b.username);
 if(selected){claims.set(key(state.run,selected),{owner:b.username,until:now+3000});n.searchGoal=null;n.searchPlanAt=0;require('./exploration').release(b.username);}
 if(!selected){n.animal=null;n.huntApproach=null;}
 const reasons=Object.entries(skipped).map(([reason,count])=>count+' '+reason).join('; ');
 return {animal:selected,goal,status:{resource:wool?'wool':'food',state:selected?'pursuing':'searching',loaded_white_sheep:white,eligible_targets:candidates.length,remembered_patches:n.memory.resources.filter(r=>r.kind===(wool?'wool':'food')).length,rejected_targets:n.rejectedAnimals?.size||0,skipped,selection_reason:selected?(selected.id!==n.animal?'Selected nearby reachable '+selected.name:'Continuing reachable '+selected.name):(reasons||'No suitable animals loaded nearby')}};
}
module.exports={choose,defer,release,deferred};

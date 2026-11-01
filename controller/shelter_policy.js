// Risk policy shared by the survival planner and emergency refuge builder.
const combat=require('./combat');
const WEAPONS=new Set(['wooden','stone','iron','golden','diamond','netherite'].flatMap(m=>[m+'_sword',m+'_axe']));
const HOSTILES=new Set(['zombie','zombie_villager','husk','drowned','skeleton','stray','bogged','creeper','spider','cave_spider','witch','pillager','vindicator','silverfish','endermite','phantom']);
function equipped(b){
 const weapon=(b.inventory?.items?.()||[]).some(i=>WEAPONS.has(i.name));
 const armor=[5,6,7,8].some(i=>/_(helmet|chestplate|leggings|boots)$/.test(b.inventory?.slots?.[i]?.name||''));
 return weapon&&armor;
}
function threats(b){return Object.values(b.entities||{}).filter(e=>{
 const key=b.registry?.entitiesByName?.[e.name]?.metadataKeys?.indexOf('health'),hp=key>=0?e.metadata?.[key]:undefined;
 return e.isValid!==false&&hp!==0&&HOSTILES.has(e.name)&&e.position?.distanceTo(b.entity.position)<24&&combat.visible(b,e);
});}
function danger(b){const time=b.time?.timeOfDay;return !Number.isFinite(time)||time>=12000||threats(b).length>0;}
function underground(b){
 if(!b.blockAt)return false;
 const p=b.entity.position.floored();
 // Natural overhead mass distinguishes a cave from leaves or a wooden hut.
 let solid=0;
 for(const y of [3,5,8,12,16])if(/^(stone|deepslate|dirt|grass_block|granite|diorite|andesite|tuff|sandstone|red_sandstone)$/.test(b.blockAt(p.offset(0,y,0))?.name||''))solid++;
 return solid>=2;
}
function assess(b,w){
 const time=b.time?.timeOfDay,night=!Number.isFinite(time)||time>=12000,cave=underground(b);
 const nearby=threats(b).filter(e=>e.position.distanceTo(b.entity.position)<( /^(skeleton|stray|bogged|pillager)$/.test(e.name)?18:12));
 const weapon=(b.inventory?.items?.()||[]).some(i=>WEAPONS.has(i.name)),armor=[5,6,7,8].filter(i=>/_(helmet|chestplate|leggings|boots)$/.test(b.inventory?.slots?.[i]?.name||'')).length;
 const capacity=(1.5+(weapon?1:0)+armor*.5)*Math.min(1,(b.health??20)/18);
 const pressure=nearby.reduce((s,e)=>s+(/^(skeleton|stray|bogged|pillager|witch|vindicator|creeper)$/.test(e.name)?2:1),0);
 const overwhelmed=nearby.length>0&&((b.health??20)<12||pressure>capacity);
 let mode='work',reason='No immediate hostile encounter';
 if(w.first_night?.hostiles){
  if(overwhelmed){mode='cover';reason='Outmatched: '+nearby.length+' nearby hostile(s), threat '+pressure+' versus capacity '+capacity.toFixed(1);}
  else if(night&&!cave&&!equipped(b)){mode='cover';reason='Unprotected on the surface at night';}
  else if(nearby.length){mode='fight';reason=(cave?'Underground':'Daytime')+' encounter is manageable';}
 }
 return {mode,reason,underground:cave,night,enemies:nearby.length,pressure,capacity};
}
function wantsCover(b,w){return assess(b,w).mode==='cover';}
module.exports={equipped,threats,danger,underground,assess,wantsCover};

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
function wantsCover(b,w){return !!w.first_night?.hostiles&&!equipped(b)&&danger(b);}
module.exports={equipped,threats,danger,wantsCover};

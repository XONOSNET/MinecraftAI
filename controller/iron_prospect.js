const {Vec3}=require('vec3'),mine=require('./staircase_mining'),nav=require('./world_navigation');
const {rules,count,usable}=require('./shelter_work'),policy=require('./shelter_policy');
const supply=['dirt','cobblestone','cobbled_deepslate'];
const budget=rules.prospect_seconds*1000;
function begin(t,b,w,left,meals,now){
 const n=t.wilderness;
 if(!rules.enabled||!rules.iron_prospecting||!w.first_night?.hostiles||!n.sleep?.morning_seen||b.isSleeping||
    left<rules.minimum_watch_remaining_seconds||!(b.time?.timeOfDay>=0&&b.time.timeOfDay<8500)||
    now<(n.nextProspect||0)||b.health<18||b.food<17||meals<2||count(b,'torch')<4||
    count(b,'raw_iron')||supply.reduce((sum,name)=>sum+count(b,name),0)<rules.repair_blocks||
    !['stone_pickaxe','iron_pickaxe','diamond_pickaxe','netherite_pickaxe'].some(name=>usable(b,name,null,24))||
    policy.threats(b).length||t.homeDamage?.unsafe||!nav.insideHome(b.entity.position,t.plot))return false;
 const target=!usable(b,'shield',45)?1:!count(b,'iron_sword')&&b.heldItem?.name!=='iron_sword'?2:4;
 if(count(b,'iron_ingot')>=target)return false;
 n.prospect={at:now,stage:'leave',target:target-count(b,'iron_ingot')};n.nextProspect=now+90000;
 t.phase='night_iron';t.path=[];t.navigator.lastPlan=-Infinity;return true;
}
async function tick(t,b,motor,state,api,scan,tasks,home){
 const n=t.wilderness,trip=n.prospect;
 if(!trip){t.phase='night_hold';return;}
 const walk=goal=>t.walk(b,motor,goal,state,api,scan,tasks);
 if(trip.stage==='leave'){
  if(await walk(nav.homeApproach(t.plot,b))===true){trip.stage='mine';n.mine=null;}
  else if(Date.now()-trip.at>12000)trip.stage='return';
  return;
 }
 if(trip.stage==='mine'){
  const m=n.mine,ending=Date.now()-trip.at>=budget||b.health<14||b.food<12||!(b.time?.timeOfDay<11000);
  if(ending){
   if(!m||m.stage==='approach'||m.stage==='done'){trip.stage='return';return;}
   if(!['exit','water_retreat'].includes(m.stage)){m.stage='exit';m.exitIndex=m.path.length-1;m.reason='Returning before the daylight prospect budget expires';}
  }
  const result=await mine.tick(t,b,motor,state,api,scan,tasks,{resource:'iron',amount:trip.target,resume:n.ironRoute});
  if(n.mine?.stage==='done'||!result.handled){
   const finished=n.mine;
   n.ironRoute=finished?.steps&&!finished.flooded?.length&&!finished.unsafe&&!/obstructed|hazard|torch supplies|excavation budget/i.test(finished.reason||'')?
    {...finished,next:null,ore_target:null,coverExit:false}:null;
   trip.stage='return';
  }
  return;
 }
 t.message='Returning to the house after the iron prospect';
 if(await walk(home)===true){
  motor.pause();delete n.prospect;t.phase='night_hold';t.lastProgress=Date.now();
 }
}
module.exports={begin,tick};

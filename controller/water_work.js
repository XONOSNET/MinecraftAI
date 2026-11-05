// Shared surface-water handoff. Preserve lesson/task state until dry work can resume.
const water=require('./water_navigation');
const {privatePlotCell}=require('./world_navigation');
const samePlot=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z;
async function tick(t,bot,motor,state,api,scan,tasks,{urgent=false,now=Date.now()}={}){
 if(['survey','complete','stopped'].includes(t.phase)||bot.isSleeping)return false;
 const p=bot.entity.position,q=p.floored();
 const wet=!!bot.entity.isInWater||water.isWater(bot.blockAt?.(q));
 // Leaving water mid-jump is not yet a dry landing. Retain the shore leg
 // until grounded so the resumed task cannot cancel the bank climb.
 if(!wet&&!(t.waterWork&&t.waterWork.run===state.run&&t.waterWork.phase===t.phase&&bot.entity.onGround===false)){t.waterWork=null;t.waterTravel=null;return false;}
 // Threat routing owns its own destination; submerged air escape runs earlier.
 if(urgent||t.wilderness?.burrow||['night_seek_cover','night_retreat','night_burrow'].includes(t.phase))return false;
 // Feet can still overlap water just after stepping onto a checked bank.
 if(bot.entity.onGround===true&&water.cell(bot,q.x,Math.round(p.y),q.z)?.wet===false){t.waterWork=null;t.waterTravel=null;return false;}
 let s=t.waterWork;
 if(!s||s.run!==state.run||s.phase!==t.phase){
  const travel=t.waterTravel;
  s=t.waterWork={run:state.run,phase:t.phase,scanAt:0,goal:null,
   travel:travel?.run===state.run&&travel.phase===t.phase&&now-travel.at<2000?[...travel.goal]:null};
 }
 const forbidden=v=>(t.campPlots||[]).some(h=>!samePlot(h,t.plot)&&privatePlotCell(v,h));
 if(s.goal&&(forbidden(s.goal)||water.cell(bot,Math.floor(s.goal[0]),Math.round(s.goal[1]),Math.floor(s.goal[2]))?.wet!==false))s.goal=null;
 if(!s.travel&&!s.goal&&now>=s.scanAt){s.scanAt=now+1000;s.goal=require('./swim_recovery').bank(bot,{bounds:state.world.bounds,forbidden});}
 const goal=s.travel||s.goal;
 if(goal){
  const moved=await t.walk(bot,motor,goal,state,api,scan,tasks,{waterRecovery:true});
  if(moved===false||moved===true){
   s.travel=null;s.goal=null;s.scanAt=now+1000;
   motor.command(4,{kind:'expedition',water_route:true,waypoints:[[p.x,p.y,p.z]]},{},0);
  }
  t.message=s.travel?'Finishing checked water travel before resuming work':'Reaching clear shore before resuming '+t.phase.replaceAll('_',' ');
 }else{
  motor.command(4,{kind:'expedition',water_route:true,waypoints:[[p.x,p.y,p.z]]},{},0);
  t.message='Maintaining buoyancy while checking clear shoreline exits';
 }
 t.navigationActive=true;
 t.lastNavigation={...t.lastNavigation,water_work:{phase:s.phase,target:goal?[...goal]:null,checked_travel:!!s.travel},in_water:!!bot.entity.isInWater};
 return true;
}
module.exports={tick};

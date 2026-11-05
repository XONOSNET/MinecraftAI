// Resume station placement after returning from mining or being displaced.
const {reference}=require('./placement_reference'),approach=require('./build_approach');
async function place(t,bot,motor,q,name,state,api,scan,tasks){
 if(bot.blockAt(q)?.name===name)return true;
 if(t.stationApproach){
  const moved=await t.walk(bot,motor,t.stationApproach,state,api,scan,tasks);
  if(moved===false){t.stationApproach=null;throw Error('No safe route to the '+name+' placement stance');}
  if(moved!==true){t.message='Approaching a reachable '+name+' supporting face';return false;}
  t.stationApproach=null;
 }
 const retry=()=>{if(!approach.retry(t,bot,q,state.world.bounds))return false;t.stationApproach=t.buildApproach;t.buildApproach=null;t.message='Repositioning beside the '+name+' supporting face';return true;};
 if(!reference(bot,q)){if(retry())return false;const error=Error('No reachable supporting face for '+name);error.code='BUILD_OBSTRUCTED';throw error;}
 motor.pause();
 if(bot.entity.onGround===false||Math.hypot(bot.entity.velocity?.x||0,bot.entity.velocity?.z||0)>.025){t.message='Settling before placing '+name;return false;}
 try{await t.place(bot,q,name);}catch(error){if(error.code==='BUILD_OBSTRUCTED'&&retry())return false;throw error;}
 return bot.blockAt(q)?.name===name;
}
module.exports={place};

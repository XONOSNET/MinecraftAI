// Expose the outdoor mount using the existing bounded entrance-leaf routine.
const lighting=require('./house_lighting'),entrance=require('./entrance_clearance'),{homeApproach}=require('./world_navigation');
async function tick(t,b,motor,state,api,scan,tasks){
 if(t.phase!=='light_place'||!t.plot||lighting.installed(b,t.plot,'outdoor'))return false;
 return entrance.tick(t,b,motor,homeApproach(t.plot,b),state,goal=>t.walk(b,motor,goal,state,api,scan,tasks));
}
module.exports={tick};

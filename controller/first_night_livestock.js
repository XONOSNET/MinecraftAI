// Explicit lesson support; natural-resource levels use observed animal memory.
const {Vec3}=require('vec3'),combat=require('./combat');
const ANIMALS=new Set(['cow','pig','sheep','chicken','rabbit']);
function owned(b,w,e){return !w.first_night.stations||JSON.stringify(e.metadata?.[2]||'').includes('FirstNight'+b.username);}
function whiteSheep(b,e){if(e.name!=='sheep')return false;const flags=e.metadata?.[b.registry.entitiesByName.sheep.metadataKeys.indexOf('wool')]||0;return e.name==='sheep'&&(flags&31)===0;}
function observe(t,b,w){for(const e of Object.values(b.entities)){if(e.isValid===false||!ANIMALS.has(e.name)||!owned(b,w,e)||e.position.distanceTo(b.entity.position)>40||!combat.visible(b,e))continue;t.wilderness.memory.remember('food',e.position);if(whiteSheep(b,e))t.wilderness.memory.remember('wool',e.position);}}
function localDrop(t,w,p){
 if(!w.first_night.stations||!t.campPlots?.length)return true;
 const hunt=t.wilderness?.huntDropOrigin;if(hunt&&Date.now()<hunt.until&&p.distanceTo(hunt.position)<3)return true;
 const owner=t.campPlots.map((h,i)=>({h,d:Math.hypot(p.x-h.x-.5,p.z-h.z-(i<4?-19:19)-.5)})).sort((a,b)=>a.d-b.d)[0]?.h;
 return owner?.x===t.plot.x&&owner?.z===t.plot.z;
}
function station(plot,index){return [plot.x+.5,plot.y+.1,plot.z+(index<4?-16:16)+.5];}
async function support(t,b,motor,state,api,scan,tasks,kind){
 const w=state.world;if(!w.first_night.stations)return false;
 const n=t.wilderness,goal=station(t.plot,w.index||0),p=b.entity.position;
 n.livestock_status={resource:kind,state:'returning_to_station'};
 if(Math.hypot(p.x-goal[0],p.z-goal[2])>3.5||Math.abs(p.y-goal[1])>.6){await t.walk(b,motor,goal,state,api,scan,tasks);t.message='Returning to assigned '+kind+' station; checking supplies';return true;}
 const present=Object.values(b.entities).some(e=>e.isValid!==false&&owned(b,w,e)&&(kind==='wool'?whiteSheep(b,e):e.name==='cow')&&e.position.distanceTo(p)<40);
 if(present){n.livestock_status.state='checking_sightline';n.stationSweep??=0;const offset=n.stationSweep%2?2:-2,sweep=[goal[0]+offset,goal[1],goal[2]+(w.index<4?-2:2)];const moved=await t.walk(b,motor,sweep,state,api,scan,tasks);if(moved===true||moved===false)n.stationSweep++;t.message='Checking another view of the assigned '+kind+' animals';return true;}
 const now=Date.now();if(now<(n.livestockAt?.[kind]||0)){motor.pause();n.livestock_status.state='waiting_for_replacement';t.message='Waiting for replacement '+(kind==='wool'?'sheep':'cow')+' at the supported lesson station';return true;}
 motor.pause();n.livestockAt??={};n.livestockAt[kind]=now+30000;
 const result=await api('/world/livestock',{agent:b.username,run:state.run,resource:kind});n.livestock_status={resource:kind,state:'replacement_requested',remaining:result.remaining};
 if(result.exhausted){t.failureCategory='resource_unavailable';throw Error('Supported '+kind+' station exhausted its bounded replacement budget');}
 t.message='Assigned '+kind+' animals depleted; requesting a replacement '+(kind==='wool'?'sheep':'cow');return true;
}
module.exports={owned,whiteSheep,observe,localDrop,station,support};

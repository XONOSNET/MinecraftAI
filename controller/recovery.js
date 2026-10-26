// Bounded local obstacle recovery, shared by teacher and policy. No route/goal oracle.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
function createRecovery(settings=()=>require('./behavior').defaults){
 let state=null,blockedAt=null,memory=[],preferredSign=1,label=null;
 const hold=text=>({forward:false,back:false,jump:false,sneak:false,yaw:0,label:text});
 function reset(){state=null;blockedAt=null;memory=[];preferredSign=1;label=null;}
 function update(base,sensed,position,yaw,now,permissions,angle=0,bounds=null){
  const rules=settings();
  memory=memory.filter(m=>now-m.at<12000);let result=base;
  if(sensed.inWater||sensed.inLava||sensed.climbing){state=null;blockedAt=null;label=base.label;return base;}
  const remembered=memory.find(m=>distance(position,m.position)<2.5&&Math.abs(wrap(yaw-m.yaw))<.65);
  if(!state){
   if(base.forward&&sensed.wallAhead&&!sensed.door&&!remembered){
    blockedAt??=now;result=hold('Wall ahead: checking escape');
    if(now-blockedAt>=rules.recovery_wait_ms){state={stage:sensed.rearSafe&&permissions.move?'back':'choose',until:now+400,deadline:now+rules.recovery_timeout_ms,origin:{...position},wallYaw:yaw,attempts:0};blockedAt=null;}
   }else if(base.forward&&remembered&&sensed.forwardClearance!==null&&sensed.forwardClearance<1.25&&!sensed.door){
    state={stage:'choose',deadline:now+rules.recovery_timeout_ms,origin:{...position},wallYaw:remembered.yaw,attempts:0};blockedAt=null;
   }else blockedAt=null;
  }
  if(state){
   if(now>state.deadline&&state.stage!=='blocked'){state.stage='blocked';state.reason='local recovery timed out';}
   if(state.stage==='rescan'){
    result=hold('Recovering: checking nearby routes');
    if(now>=state.until)state.stage='choose';
   }
   if(state.stage==='back'){
    if(now<state.until&&sensed.rearSafe&&permissions.move){result=hold('Reversing out of blocked position');result.back=true;}
    else state.stage='choose';
   }
   if(state.stage==='choose'){
    const inBounds=r=>{if(!bounds)return true;const span=Math.min(2,r.clearance);const x=position.x-Math.sin(r.yaw)*span,z=position.z-Math.cos(r.yaw)*span;return x>bounds[0]+.35&&x<bounds[1]-.35&&z>bounds[2]+.35&&z<bounds[3]-.35;};
    const candidates=(sensed.escapeRoutes||[]).filter(r=>inBounds(r)&&Number.isFinite(r.yaw)&&Number.isFinite(r.offset)&&Number.isFinite(r.clearance)&&r.clearance>=.65&&Math.abs(wrap(r.yaw-state.wallYaw))>.7);
    const long=candidates.filter(r=>r.clearance>=1.25),routes=long.length?long:candidates;
    // The checkpoint bearing is already observed by both controllers. Use it
    // only to choose between safe local exits, never to bypass clearance checks.
    const score=r=>r.clearance-Math.abs(wrap(r.yaw-(yaw+angle)))*.3+(Math.sign(wrap(r.yaw-state.wallYaw))===preferredSign ? .05 : 0);
    routes.sort((a,b)=>score(b)-score(a));
    const route=routes[0];
    if(!permissions.turn||!permissions.move){state.stage='blocked';state.reason='movement restricted';}
    else if(!route){
     state.scans=(state.scans||0)+1;
     if(state.scans<3){state.stage='rescan';state.until=now+750;result=hold('Recovering: checking nearby routes');}
     else{state.stage='blocked';state.reason='no checked local route';}
    }else if(++state.attempts>3){state.stage='blocked';state.reason='local retry limit reached';}
    else{state.stride=route.clearance<1.25?Math.max(.35,route.clearance-.15):1.5;state.yaw=route.yaw;preferredSign=Math.sign(wrap(route.yaw-state.wallYaw))||preferredSign;state.stage='turn';}
   }
   if(state.stage==='turn'){
    result=hold('Recovering: turning toward clear space');result.targetYaw=state.yaw;
    if(Math.abs(wrap(state.yaw-yaw))<.1){state.stage='advance';state.walkFrom={...position};state.until=now+1200;}
   }
   if(state.stage==='advance'){
    if(distance(position,state.walkFrom)>=state.stride||(distance(position,state.walkFrom)>=.35&&sensed.goalClearance>=1.6)){
     memory.push({position:state.origin,yaw:state.wallYaw,at:now});memory=memory.slice(-4);state=null;
     result=hold('Recovering: detour complete');
    }else if(now>=state.until||sensed.wallAhead||!(typeof sensed.canWalk==='function'?sensed.canWalk(state.yaw,.35):sensed.escapeForwardSafe)){state.stage='choose';result=hold('Recovering: checking another exit');}
    else{result=hold('Recovering: moving around obstacle');result.forward=true;result.targetYaw=state.yaw;}
   }
   if(state?.stage==='blocked')result=hold('Recovering: '+(state.reason||'local search stopped')+'; waiting for reset');
  }
  label=result.label;return result;
 }
 return {update,reset,active:()=>!!state,remembering:()=>memory.length>0,label:()=>label};
}
module.exports={createRecovery};

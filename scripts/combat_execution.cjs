// Experiment accounting only; these values are never supplied to the policy.
const CONTROL_KEYS=['forward','back','left','right','jump','sneak','sprint'];
const {performance}=require('node:perf_hooks');
const START_LIMITS=Object.freeze({player_blocks:.08,yaw_radians:Math.PI/360,
 target_blocks:.35,release_ms:500});
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
function pose(entity){
 if(!entity?.position)return null;
 const {x,y,z}=entity.position;
 return {position:[x,y,z],yaw:entity.yaw,pitch:entity.pitch,on_ground:entity.onGround??null};
}
function startIssue(frozen,player,target,damage,dead,elapsed){
 if(dead||damage>0)return 'damage before first decision';
 if(!player||!target)return 'entity missing before first decision';
 if(distance(frozen.player.position,player.position)>START_LIMITS.player_blocks||
    Math.abs(wrap(frozen.player.yaw-player.yaw))>START_LIMITS.yaw_radians)return 'player drift before first decision';
 if(distance(frozen.target.position,target.position)>START_LIMITS.target_blocks)return 'target drift before first decision';
 if(elapsed>START_LIMITS.release_ms)return 'slow first decision';
 return null;
}
function healthUpdate(encounter,health){
 const loss=Math.max(0,encounter.health-health);
 if(loss>0){encounter.damage+=loss;encounter.damageEvents++;}
 encounter.health=health;
 return loss;
}
// This journal orders local callbacks on one clock. It does not reveal the
// server's combat tick or imply that a hurt receipt was caused by the active
// decision. Null decision labels events received between execution windows.
function recordEvent(encounter,kind,fields={},at=performance.now()){
 if(!encounter||encounter.closed||encounter.releaseMonotonic==null)return null;
 const event={kind,at_ms:at-encounter.releaseMonotonic,decision:encounter.activeDecision??null,...fields};
 encounter.events.push(event);
 return event;
}
function sampleControls(execution,controls,usingItem){
 execution.physics_ticks++;
 for(const key of CONTROL_KEYS)if(controls[key])execution.controls_ticks[key]++;
 if(usingItem)execution.held_item_ticks++;
}
module.exports={CONTROL_KEYS,START_LIMITS,pose,distance,wrap,startIssue,healthUpdate,recordEvent,sampleControls};

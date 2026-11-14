// Experiment accounting only; these values are never supplied to the policy.
const CONTROL_KEYS=['forward','back','left','right','jump','sneak','sprint'];
const {performance}=require('node:perf_hooks');
const {isDeepStrictEqual}=require('node:util');
const START_LIMITS=Object.freeze({player_blocks:.08,yaw_radians:Math.PI/360,
 target_blocks:.35,release_ms:500});
const FROZEN_DASHBOARD_RETRY=Object.freeze({timeout_ms:1500,retries:2,delay_ms:250});
const OPENING_SWINGS=Object.freeze(['helper','grounded']);
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
function frozenStartIssue(frozen,actual,damage,dead,elapsed=0){
 const issue=startIssue(frozen,actual.player,actual.target,damage,dead,elapsed);
 if(issue)return issue;
 if(frozen.player_id!==actual.player_id||frozen.target_id!==actual.target_id)return 'frozen fixture entity changed';
 if(!actual.ai_frozen)return 'target unfrozen before first decision';
 if(distance(frozen.target.position,actual.target.position)>START_LIMITS.player_blocks||
    Math.abs(wrap(frozen.target.yaw-actual.target.yaw))>START_LIMITS.yaw_radians||
    Math.abs(frozen.target.pitch-actual.target.pitch)>START_LIMITS.yaw_radians||
    Math.abs(frozen.player.pitch-actual.player.pitch)>START_LIMITS.yaw_radians||
    frozen.player.on_ground!==actual.player.on_ground||frozen.target.on_ground!==actual.target.on_ground){
  return 'frozen fixture pose changed';
 }
 if(frozen.health!==actual.health||frozen.food!==actual.food||frozen.saturation!==actual.saturation||
    frozen.gamemode!==actual.gamemode)return 'frozen fixture survival state changed';
 if(!isDeepStrictEqual(frozen.loadout,actual.loadout)||
    !isDeepStrictEqual(frozen.target_equipment,actual.target_equipment)||
    !isDeepStrictEqual(frozen.item_state,actual.item_state))return 'frozen fixture loadout changed';
 return null;
}
async function sampleFrozenDashboard(sample,checkStart,wait){
 const {timeout_ms,retries,delay_ms}=FROZEN_DASHBOARD_RETRY;
 const attempts=[];
 let server=null;
 for(let attempt=0;attempt<=retries;attempt++){
  const before=checkStart();
  if(before)return {server,attempts,issue:before};
  const started_at_ms=Date.now();
  server=await sample(timeout_ms);
  attempts.push({started_at_ms,finished_at_ms:Date.now(),outcome:server.unavailable??'received'});
  const after=checkStart();
  if(after)return {server,attempts,issue:after};
  if(server.unavailable!=='TimeoutError'||attempt===retries)break;
  await wait(delay_ms);
 }
 return {server,attempts,issue:null};
}
function openingAttackTask(encounter,mode,action){
 if(mode===undefined)return encounter.task;
 if(!OPENING_SWINGS.includes(mode)||action!==6||encounter.openingUsed){
  throw Error('Invalid or repeated experimental opening attack');
 }
 const {enemy,gear,distance,sight,cooldown}=encounter.sensed;
 if(!encounter.observedGrounded||!enemy||!gear.weapon||!(distance<=3)||!sight||cooldown!==0){
  throw Error('Experimental opening attack requires a grounded eligible observation');
 }
 encounter.openingUsed=true;
 return mode==='grounded'?{...encounter.task,critical_hits:false}:encounter.task;
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
module.exports={CONTROL_KEYS,START_LIMITS,FROZEN_DASHBOARD_RETRY,OPENING_SWINGS,pose,distance,wrap,startIssue,frozenStartIssue,
 sampleFrozenDashboard,openingAttackTask,healthUpdate,recordEvent,sampleControls};

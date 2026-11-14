// One isolated native player, controlled through a JSON-lines pipe.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {once}=require('node:events'),readline=require('node:readline');
const {performance}=require('node:perf_hooks');
const mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const combat=require('../controller/combat'),tasks=require('../controller/tasks');
const {scan}=require('../controller/perception'),{createMotor}=require('../controller/locomotion');
const {defaults}=require('../controller/behavior');
const {CONTROL_KEYS,START_LIMITS,pose,distance:poseDistance,wrap,startIssue,healthUpdate,recordEvent,sampleControls}=require('./combat_execution.cjs');
const user='LabCombatRL',tag='lab_rl_fixture',center=1500,z=-1500,y=211;
const min=[center-13,y-1,z-4],max=[center+13,y+4,z+4];
const cleanupOnly=process.argv.includes('--clean-only');
const probeClean=process.argv.includes('--probe-clean');
const token=fs.readFileSync('data/api-token','utf8').trim();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:user,auth:'offline',version:'1.21.4'});
require('../controller/inventory_sync').attach(bot);
const permissions={move:true,turn:true,jump:true,sprint:true,combat_practice:true};
const motor=createMotor(bot,permissions);
let changed=false,current=null,dead=false;
let commandTree=null,operatorPending=false,serverSample=null,serverSampleAt=-Infinity,fixtureDifficulty=null;
const parsedMessages=[];
bot.on('messagestr',message=>{parsedMessages.push(message);if(parsedMessages.length>10)parsedMessages.shift();});
let batch=0;
bot._client.on('declare_commands',packet=>{commandTree=packet;});
bot.on('physicsTick',()=>{
 // Mineflayer applies this tick before emitting the event; capture consumed
 // controls before the motor writes another plan for the next tick.
 if(current?.execution)sampleControls(current.execution,
  Object.fromEntries(CONTROL_KEYS.map(key=>[key,bot.getControlState(key)])),bot.usingHeldItem);
 motor.tick();
});
bot.on('entityDead',enemy=>{if(current&&!current.closed)combat.death(enemy,current.task,current.runtime);});
bot.on('health',()=>{
 if(current&&!current.closed){
  const loss=healthUpdate(current,bot.health);
  if(loss>0)recordEvent(current,'player_damage',{loss,health:bot.health});
 }
});
// Consume one native damage event, not overlapping hurt animations/status events.
bot._client.on('damage_event',event=>{
 const c=current;if(!c||c.closed||!bot.entity)return;
 if(event.entityId===c.enemyId&&event.sourceCauseId===bot.entity.id+1){
  c.targetHurts++;recordEvent(c,'target_hurt',{target_id:c.enemyId});
 }else if(event.entityId===bot.entity.id&&event.sourceCauseId===c.enemyId+1){
  recordEvent(c,'player_hurt',{source_id:c.enemyId});
 }
});
bot.on('death',()=>{dead=true;motor.pause();});
bot.on('error',error=>console.error(error.message));
async function admin(action,extra={}){
 for(let i=0;i<20;i++){
  const reply=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},
   body:JSON.stringify({action,player:user,...extra}),signal:AbortSignal.timeout(8000)});
  if(reply.ok)return;
  const message=await reply.text();
  if(!message.includes('not online')||i===19)throw Error(message);
  await wait(750);
 }
}
async function until(predicate,ms=5000,interval=25){
 const untilAt=Date.now()+ms;
 while(!predicate()&&Date.now()<untilAt)await wait(interval);
 return predicate();
}
function hasOperatorCommands(){
 if(!commandTree)return null;
 const root=commandTree.nodes[commandTree.rootIndex];
 return root?.children.some(index=>commandTree.nodes[index]?.extraNodeData?.name==='gamemode')??false;
}
async function operator(wanted){
 if(hasOperatorCommands()===wanted&&!operatorPending)return;
 operatorPending=true;
 await admin(wanted?'op':'deop');
 assert.ok(await until(()=>hasOperatorCommands()===wanted),'Fixture operator command tree was not acknowledged');
 operatorPending=false;
}
async function commands(lines,holdOperator=false){
 await operator(true);
 let acknowledged=false;
 try{
  // Let the server's command-spam counter drain between commands, even when
  // the fixture is repeatedly opped and deopped across encounters.
  for(const line of lines){bot.chat('/'+line);await wait(1100);}
  const marker='Combat fixture batch '+(++batch);
  bot.chat('/tellraw @s '+JSON.stringify({text:marker}));
  for(let i=0;i<50&&!parsedMessages.includes(marker);i++)await wait(200);
  assert.ok(parsedMessages.includes(marker),'Fixture commands were not acknowledged: '+parsedMessages.join(' | '));
  acknowledged=true;
 }
 finally{if(!holdOperator||!acknowledged)await operator(false);}
}
async function difficulty(){
 // No argument: Minecraft reports the world's difficulty without changing it.
 // Some Paper versions don't send the difficulty packet on player login.
 const at=parsedMessages.slice();
 await commands(['difficulty']);
 const observed=parsedMessages.find(message=>!at.includes(message)&&/difficulty.*\b(peaceful|easy|normal|hard)\b/i.test(message));
 const value=observed?.match(/difficulty.*\b(peaceful|easy|normal|hard)\b/i)?.[1]?.toLowerCase();
 assert.ok(value,'Native /difficulty query was not acknowledged: '+parsedMessages.join(' | '));
 return value;
}
async function serverConditions(){
 if(Date.now()-serverSampleAt<30_000)return serverSample;
 serverSampleAt=Date.now();
 try{
  const reply=await fetch('http://127.0.0.1:8000/status?compact=true',{signal:AbortSignal.timeout(1500)});
  if(reply.ok){
   const state=await reply.json(),s=state.server||{};
   serverSample={sampled_at_ms:Date.now(),pid:s.pid,version:s.version,ready:s.ready,busy:s.busy,
    tps:s.tps,mspt:s.mspt,timing_sample_at:s.timing_sample_at,players_online:s.players_online,
    ram_percent:state.ram_percent};
  }else serverSample={sampled_at_ms:Date.now(),unavailable:'HTTP '+reply.status};
 }catch(error){serverSample={sampled_at_ms:Date.now(),unavailable:error.name};}
 return serverSample;
}
function volumeMatches(names){
 for(let x=min[0];x<=max[0];x++)for(let by=min[1];by<=max[1];by++)for(let bz=min[2];bz<=max[2];bz++)
  if(!names.includes(bot.blockAt(new Vec3(x,by,bz))?.name))return false;
 return true;
}
const empty=()=>volumeMatches(['air']);
function inventoryEmpty(){
 return !bot.inventory.slots.slice(5,46).some(Boolean);
}
function fixtureEntities(){
 return Object.values(bot.entities).filter(entity=>entity.id!==bot.entity.id&&entity.isValid!==false&&
  /^(zombie|skeleton|item|experience_orb|arrow)$/.test(entity.name||'')&&entity.position&&
  [entity.position.x,entity.position.y,entity.position.z].every((v,i)=>v>=min[i]&&v<max[i]+1));
}
async function setup(){
 await once(bot,'spawn',{signal:AbortSignal.timeout(15000)});
 // Wrap the fixture API after Mineflayer injects it. The original call still
 // performs the actual write, without any added wait or changed arguments.
 const attack=bot.attack;
 bot.attack=function(target,...args){
  const c=current,at=performance.now(),result=attack.call(this,target,...args);
  if(c&&target?.id===c.enemyId)recordEvent(c,'attack_request',{target_id:target.id},at);
  return result;
 };
 await admin('gamemode',{gamemode:'creative'});
 await admin('teleport-coordinates',{x:center,y:y+8,z});
 if(probeClean){
  assert.ok(await until(empty,9000,300),'Fixture blocks remain or could not be verified');
  assert.equal(fixtureEntities().length,0,'Fixture entities remain');
  assert.ok(inventoryEmpty(),'Fixture supplies remain');
  assert.equal(hasOperatorCommands(),false,'Fixture still has elevated command access or permission is unknown');
  return;
 }
 if(cleanupOnly){
  const fixture=['air','glass','sea_lantern'];
  for(let i=0;i<30&&!volumeMatches(fixture);i++)await wait(300);
  assert.ok(volumeMatches(fixture),'Fixture cleanup refused an unexpected block');
  changed=true;return;
 }
 for(let i=0;i<30&&!empty();i++)await wait(300);
 assert.ok(empty(),'Fixture volume must be loaded and empty');changed=true;
 await commands([
  `fill ${min.join(' ')} ${max.join(' ')} minecraft:glass hollow`,
  `fill ${min[0]+1} ${y-1} ${z-3} ${max[0]-1} ${y-1} ${z+3} minecraft:sea_lantern`
 ]);
 const floor=new Vec3(center,y-1,z);
 for(let i=0;i<30&&bot.blockAt(floor)?.name!=='sea_lantern';i++)await wait(200);
 assert.equal(bot.blockAt(floor)?.name,'sea_lantern',parsedMessages.join(' | '));
 fixtureDifficulty=await difficulty();
}
async function reset(seed,mob){
 if(!['zombie','skeleton'].includes(mob)||!Number.isSafeInteger(seed)||seed<0)throw Error('Invalid encounter');
 motor.pause();current=null;
 if(bot.health===0)await wait(500);
 const distance=6+(seed*48271%2147483647)/2147483647*4;
 const offset=(seed*69621%2147483647)/2147483647*3.6-1.8;
 const yaw=-110+(seed*16807%2147483647)/2147483647*40;
 const label='RL'+seed;
 const playerPos=[center-9+.5,y,z+.5],enemyPos=[center-9+.5+distance,y,z+.5+offset];
 await commands([
  'gamemode creative @s',`kill @e[tag=${tag}]`,
  `kill @e[type=item,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  `kill @e[type=experience_orb,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  `kill @e[type=arrow,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  'clear @s','effect clear @s','effect give @s instant_health 1 5 true','effect give @s saturation 1 5 true',
  'item replace entity @s weapon.mainhand with iron_sword',
  ...[['head','helmet'],['chest','chestplate'],['legs','leggings'],['feet','boots']].map(([slot,item])=>`item replace entity @s armor.${slot} with iron_${item}`),
  ...(mob==='skeleton'?['item replace entity @s weapon.offhand with shield']:[]),
  `tp @s ${playerPos.join(' ')} ${yaw} 0`,
  `summon minecraft:${mob} ${enemyPos.join(' ')} {Tags:["${tag}"],CustomName:'{"text":"${label}"}',PersistenceRequired:1b,CanPickUpLoot:0b,DeathLootTable:"minecraft:empty",IsBaby:0b,NoAI:1b}`,
  'gamemode survival @s'
 ],true);
 dead=false;
 const task={kind:'combat',mobs:[mob],mob_label:label,bounds:[min[0],max[0]+1,min[2],max[2]+1],min_y:y,max_y:y+3,
  weapon:'iron_sword',armor:'iron',shield:mob==='skeleton',kill_target:1,critical_hits:true,safe_walk:true,strict_ground:true};
 const ready=()=>bot.game.gameMode==='survival'&&bot.health===20&&bot.food===20&&combat.equipment(bot,task).ready&&combat.target(bot,task);
 for(let i=0;i<30&&!ready();i++)await wait(100);
 assert.ok(ready(),'Encounter reset was not confirmed: '+parsedMessages.join(' | '));
 const enemy=combat.target(bot,task);
 const flag=bot.registry.entitiesByName[mob].metadataKeys.indexOf('mob_flags');
 assert.ok(flag>=0&&(Number(enemy.metadata[flag])&1),'Fixture opponent must be frozen before release');
 const conditions=await serverConditions();
 if(conditions?.busy||conditions?.ready===false)throw Error('Minecraft reports a server operation; fixture start deferred');
 await wait(1100); // Allow the marker command to drain while the mob is still frozen.
 assert.equal(hasOperatorCommands(),true,'Fixture release requires acknowledged command access');
 const verified={player:pose(bot.entity),target:pose(enemy),health:bot.health,food:bot.food,
  saturation:bot.foodSaturation,gamemode:bot.game.gameMode,
  loadout:{mainhand:bot.heldItem?.name||null,armor:[5,6,7,8].map(i=>bot.inventory.slots[i]?.name||null),
   offhand:bot.inventory.slots[45]?.name||null},
  target_equipment:enemy.equipment?.map(item=>item?.name||null)??null};
 assert.ok(ready()&&poseDistance(verified.player.position,playerPos)<=.08&&
  Math.abs(wrap(verified.player.yaw-(Math.PI-yaw*Math.PI/180)))<=START_LIMITS.yaw_radians&&
  poseDistance(verified.target.position,enemyPos)<=.08,'Encounter pose changed during frozen reset');
 const preparedAt=Date.now();
 current={task,runtime:tasks.createRuntime(),seed,mob,start:null,preparedAt,steps:0,health:bot.health,damage:0,
  damageEvents:0,targetHurts:0,enemyId:enemy.id,enemy,flag,events:[],releaseMonotonic:null,activeDecision:null};
 current.startInfo={requested:{player_position:playerPos,player_yaw_degrees:yaw,target_position:enemyPos},
  verified,mob,difficulty:bot.game.difficulty??fixtureDifficulty,arena:{min,max,floor:'sea_lantern',walls:'glass'},
  prepared_at_ms:preparedAt,predecision_damage:current.damage,ai_frozen:true,
  observed:{player:pose(bot.entity),target:pose(enemy)},server:conditions};
 return {...observe(),start:current.startInfo};
}
function terminal(reason,valid=true){
 const c=current;
 motor.pause();bot.deactivateItem();c.closed=true;
 return {done:true,valid,win:reason==='win',dead,
  escaped:reason==='escaped',damage:c.damage,seconds:(Date.now()-(c.start??c.preparedAt))/1000,seed:c.seed,mob:c.mob,steps:c.steps,
  reason,invalid_reason:valid?null:reason,events:c.events};
}
function observe(){
 const c=current,p=bot.entity.position,goal=c.task.bounds;
 const win=!!c.runtime.kills&&!dead,escaped=p.x<=goal[0]||p.x>=goal[1]||p.z<=goal[2]||p.z>=goal[3]||p.y<y-.2;
 if(!c.steps&&(dead||c.damage>0))return terminal('damage before first decision',false);
 if(win||dead||escaped||c.start!==null&&Date.now()-c.start>=30000||c.steps>=250)return terminal(dead?'death':win?'win':escaped?'escaped':c.steps>=250?'step limit':'time limit');
 const sensed=combat.observe(bot,c.task,c.runtime),rays=scan(bot);
 c.sensed=sensed;c.proximity=rays.proximity;
 return {done:false,damage:c.damage,observation:[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),bot.health/20,bot.food/20,Number(!!bot.entity.onGround),...sensed.extra],
  teacher:combat.teacher(sensed,c.task)};
}
async function endEncounter(reply){
 if(reply.done){
  await admin('gamemode',{gamemode:'creative'});
  await operator(false);
 }
 return reply;
}
async function step(action){
 const receivedAt=performance.now();
 if(!Number.isInteger(action)||action<0||action>6)throw Error('Invalid combat action');
 const c=current,s=c.sensed;
 const eventOffset=c.events.length,decision=c.steps+1;
 let proposal;
 let verifyRelease;
 if(!c.steps){
  const predecisionMs=Date.now()-c.preparedAt;
  const issue=startIssue(c.startInfo.verified,pose(bot.entity),pose(bot.entities[c.enemyId]),c.damage,dead,predecisionMs)||
   (Number(c.enemy.metadata[c.flag])&1?null:'target unfrozen before first decision');
  if(issue)return endEncounter(terminal(issue,false));
  c.start=Date.now();
  c.release={started_at_ms:c.start,predecision_ms:predecisionMs};
  c.releaseMonotonic=performance.now();
  c.activeDecision=decision;
  proposal=recordEvent(c,'proposal',{action},receivedAt);
  // Proposal selected from the verified frozen observation. Send release on
  // this same client before any action packet; begin actuation this JS turn,
  // so no opponent movement or damage precedes an action during inference.
  bot.chat('/'+`data merge entity @e[tag=${tag},limit=1] {NoAI:0b}`);
  verifyRelease=until(()=>!(Number(c.enemy.metadata[c.flag])&1),3000,10).then(confirmed=>{
   c.release.confirmed=confirmed;
   c.release.acknowledged_at_ms=confirmed?Date.now():null;
   c.release.release_ms=confirmed?c.release.acknowledged_at_ms-c.start:null;
  });
 }
 c.activeDecision=decision;
 proposal??=recordEvent(c,'proposal',{action},receivedAt);
 const before=pose(bot.entity),at=Date.now(),damage=c.damage,damageEvents=c.damageEvents,hurt=c.targetHurts,
  attacks=c.runtime.hits||0,critical=c.runtime.criticalAttempts||0;
 const execution={proposed:action,decision,at_ms:proposal.at_ms,before,physics_ticks:0,held_item_ticks:0,
  controls_ticks:Object.fromEntries(CONTROL_KEYS.map(key=>[key,0])),interaction:null};
 c.execution=execution;
 motor.command(action,c.task,{...s,...c.proximity,rearSafe:c.proximity.canWalk(bot.entity.yaw+Math.PI,.7)},s.angle);
 if([4,5,6].includes(action)){
  if(action!==4)motor.pause();
  motor.lockLook(true);
  try{execution.interaction=await combat.interact(bot,c.task,s,c.runtime,action,permissions);}
  finally{motor.lockLook(false);}
 }else if(bot.usingHeldItem)bot.deactivateItem();
 c.steps++;await wait(100);
 if(verifyRelease){await verifyRelease;execution.release=c.release;}
 const after=pose(bot.entity);c.execution=null;c.activeDecision=null;
 Object.assign(execution,{after,movement:{blocks:poseDistance(before.position,after.position),yaw_radians:wrap(after.yaw-before.yaw)},
  attack_requests:(c.runtime.hits||0)-attacks,critical_attempts:(c.runtime.criticalAttempts||0)-critical,
  target_hurts:c.targetHurts-hurt,damage_events:c.damageEvents-damageEvents,damage_delta:c.damage-damage,
  elapsed_ms:Date.now()-at,events:c.events.slice(eventOffset)});
 if(verifyRelease&&!c.release.confirmed)return endEncounter({...terminal('native release was not confirmed',false),execution});
 return endEncounter({...observe(),execution});
}
async function cleanup(){
 motor.pause();
 if(probeClean)return;
 if(current)current.closed=true;
 try{
  if(changed){
   await admin('gamemode',{gamemode:'creative'});
   await admin('teleport-coordinates',{x:center,y:y+8,z});await bot.waitForChunksToLoad();
   await commands(['clear @s',`kill @e[tag=${tag}]`,
    ...['item','experience_orb','arrow'].map(type=>`kill @e[type=${type},x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`),
    `fill ${min.join(' ')} ${max.join(' ')} minecraft:air`]);
   for(let i=0;i<20&&!empty();i++)await wait(250);
   assert.ok(empty(),'Fixture cleanup could not be verified');
   assert.ok(await until(()=>!fixtureEntities().length&&inventoryEmpty()),'Fixture entities or supplies remain');
  }
 }finally{await operator(false);}
}
async function main(){
 let failure;
 try{
  await setup();
  if(cleanupOnly||probeClean)return;
  output({ready:true,metadata:{controller_revision:require('../controller/controller_revision'),behavior:defaults,
   permissions,start_limits:START_LIMITS,difficulty:fixtureDifficulty,minecraft_version:bot.version,
   profile:'legacy-iron',geometry:{min,max},event_clock:'monotonic_ms_from_release_send'}});
  for await(const line of readline.createInterface({input:process.stdin})){
   const request=JSON.parse(line);
   if(request.close)break;
   output(request.reset?await endEncounter(await reset(request.seed,request.mob)):await step(request.action));
  }
 }catch(error){failure=error;output({error:error.message});console.error(error);}
 finally{
  try{await cleanup();output({cleaned:true});}
  finally{bot.quit();if(failure)process.exitCode=1;}
 }
}
main().catch(error=>{output({error:error.message});console.error(error);process.exitCode=1;});

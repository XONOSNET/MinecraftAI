// One isolated native player, controlled through a JSON-lines pipe.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {once}=require('node:events'),readline=require('node:readline');
const mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const combat=require('../controller/combat'),tasks=require('../controller/tasks');
const {scan}=require('../controller/perception'),{createMotor}=require('../controller/locomotion');
const user='LabCombatRL',tag='lab_rl_fixture',center=1500,z=-1500,y=211;
const min=[center-13,y-1,z-4],max=[center+13,y+4,z+4];
const cleanupOnly=process.argv.includes('--clean-only');
const token=fs.readFileSync('data/api-token','utf8').trim();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:user,auth:'offline',version:'1.21.4'});
require('../controller/inventory_sync').attach(bot);
const permissions={move:true,turn:true,jump:true,sprint:true,combat_practice:true};
const motor=createMotor(bot,permissions);
let changed=false,current=null,dead=false;
const parsedMessages=[];
bot.on('messagestr',message=>{parsedMessages.push(message);if(parsedMessages.length>10)parsedMessages.shift();});
let batch=0;
bot.on('physicsTick',()=>motor.tick());
bot.on('entityDead',enemy=>{if(current)combat.death(enemy,current.task,current.runtime);});
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
async function commands(lines,confirm=null){
 await admin('op');await wait(400);
 try{
  // Let the server's command-spam counter drain between commands, even when
  // the fixture is repeatedly opped and deopped across encounters.
  for(const line of lines){bot.chat('/'+line);await wait(1100);}
  const marker='Combat fixture batch '+(++batch);
  bot.chat('/tellraw @s '+JSON.stringify({text:marker}));
  for(let i=0;i<50&&!parsedMessages.includes(marker);i++)await wait(200);
  assert.ok(parsedMessages.includes(marker),'Fixture commands were not acknowledged: '+parsedMessages.join(' | '));
  if(confirm)await confirm();
 }
 finally{await admin('deop');}
}
function volumeMatches(names){
 for(let x=min[0];x<=max[0];x++)for(let by=min[1];by<=max[1];by++)for(let bz=min[2];bz<=max[2];bz++)
  if(!names.includes(bot.blockAt(new Vec3(x,by,bz))?.name))return false;
 return true;
}
const empty=()=>volumeMatches(['air']);
async function setup(){
 await once(bot,'spawn',{signal:AbortSignal.timeout(15000)});await admin('gamemode',{gamemode:'creative'});
 await admin('teleport-coordinates',{x:center,y:y+8,z});
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
}
async function reset(seed,mob){
 if(!['zombie','skeleton'].includes(mob)||!Number.isSafeInteger(seed)||seed<0)throw Error('Invalid encounter');
 motor.pause();current=null;
 if(bot.health===0)await wait(500);
 const distance=6+(seed*48271%2147483647)/2147483647*4;
 const offset=(seed*69621%2147483647)/2147483647*3.6-1.8;
 const yaw=-110+(seed*16807%2147483647)/2147483647*40;
 const label='RL'+seed;
 await commands([
  'gamemode creative @s',`kill @e[tag=${tag}]`,
  `kill @e[type=item,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  `kill @e[type=experience_orb,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  `kill @e[type=arrow,x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`,
  'clear @s','effect clear @s','effect give @s instant_health 1 5 true','effect give @s saturation 1 5 true',
  'item replace entity @s weapon.mainhand with iron_sword',
  ...[['head','helmet'],['chest','chestplate'],['legs','leggings'],['feet','boots']].map(([slot,item])=>`item replace entity @s armor.${slot} with iron_${item}`),
  ...(mob==='skeleton'?['item replace entity @s weapon.offhand with shield']:[]),
  `tp @s ${center-9+.5} ${y} ${z+.5} ${yaw} 0`,
  `summon minecraft:${mob} ${center-9+.5+distance} ${y} ${z+.5+offset} {Tags:["${tag}"],CustomName:'{"text":"${label}"}',PersistenceRequired:1b,CanPickUpLoot:0b,DeathLootTable:"minecraft:empty",IsBaby:0b,NoAI:1b}`,
  'gamemode survival @s'
 ]);
 dead=false;
 const task={kind:'combat',mobs:[mob],mob_label:label,bounds:[min[0],max[0]+1,min[2],max[2]+1],min_y:y,max_y:y+3,
  weapon:'iron_sword',armor:'iron',shield:mob==='skeleton',kill_target:1,critical_hits:true,safe_walk:true,strict_ground:true};
 const ready=()=>bot.game.gameMode==='survival'&&bot.health===20&&bot.food===20&&combat.equipment(bot,task).ready&&combat.target(bot,task);
 for(let i=0;i<30&&!ready();i++)await wait(100);
 assert.ok(ready(),'Encounter reset was not confirmed: '+parsedMessages.join(' | '));
 current={task,runtime:tasks.createRuntime(),seed,mob,start:Date.now(),steps:0,health:bot.health,damage:0};
 const enemy=combat.target(bot,task);
 const flag=bot.registry.entitiesByName[mob].metadataKeys.indexOf('mob_flags');
 assert.ok(flag>=0&&(Number(enemy.metadata[flag])&1),'Fixture opponent must be frozen before release');
 await commands([`data merge entity @e[tag=${tag},limit=1] {NoAI:0b}`],async()=>{
  for(let i=0;i<30&&(Number(enemy.metadata[flag])&1);i++)await wait(100);
  assert.equal(Number(enemy.metadata[flag])&1,0,'Native release was not confirmed');
  current.start=Date.now();
 });
 return observe();
}
function observe(){
 const c=current,p=bot.entity.position,goal=c.task.bounds;
 if(!dead)c.damage+=Math.max(0,c.health-bot.health);
 else c.damage+=c.health;
 c.health=dead?0:bot.health;
 const win=!!c.runtime.kills&&!dead,escaped=p.x<=goal[0]||p.x>=goal[1]||p.z<=goal[2]||p.z>=goal[3]||p.y<y-.2;
 if(win||dead||escaped||Date.now()-c.start>=30000||c.steps>=250){
  motor.pause();return {done:true,win,dead,escaped,damage:c.damage,seconds:(Date.now()-c.start)/1000,seed:c.seed,mob:c.mob};
 }
 const sensed=combat.observe(bot,c.task,c.runtime),rays=scan(bot);
 c.sensed=sensed;c.proximity=rays.proximity;
 return {done:false,damage:c.damage,observation:[...rays.pooled,Math.sin(sensed.angle),Math.cos(sensed.angle),Math.min(sensed.distance/32,1),bot.health/20,bot.food/20,Number(!!bot.entity.onGround),...sensed.extra],
  teacher:combat.teacher(sensed,c.task)};
}
async function step(action){
 if(!Number.isInteger(action)||action<0||action>6)throw Error('Invalid combat action');
 const c=current,s=c.sensed;
 motor.command(action,c.task,{...s,...c.proximity,rearSafe:c.proximity.canWalk(bot.entity.yaw+Math.PI,.7)},s.angle);
 if([4,5,6].includes(action)){
  if(action!==4)motor.pause();
  motor.lockLook(true);
  try{await combat.interact(bot,c.task,s,c.runtime,action,permissions);}
  finally{motor.lockLook(false);}
 }else if(bot.usingHeldItem)bot.deactivateItem();
 c.steps++;await wait(100);return observe();
}
async function cleanup(){
 motor.pause();
 if(changed){
  await admin('gamemode',{gamemode:'creative'});
  await admin('teleport-coordinates',{x:center,y:y+8,z});await bot.waitForChunksToLoad();
  await commands(['clear @s',`kill @e[tag=${tag}]`,
   ...['item','experience_orb','arrow'].map(type=>`kill @e[type=${type},x=${min[0]},y=${min[1]},z=${min[2]},dx=26,dy=5,dz=8]`),
   `fill ${min.join(' ')} ${max.join(' ')} minecraft:air`]);
  for(let i=0;i<20&&!empty();i++)await wait(250);
  assert.ok(empty(),'Fixture cleanup could not be verified');
 }
}
async function main(){
 let failure;
 try{
  await setup();
  if(cleanupOnly)return;
  output({ready:true});
  for await(const line of readline.createInterface({input:process.stdin})){
   const request=JSON.parse(line);
   if(request.close)break;
   output(request.reset?await reset(request.seed,request.mob):await step(request.action));
  }
 }catch(error){failure=error;output({error:error.message});console.error(error);}
 finally{
  try{await cleanup();output({cleaned:true});}
  finally{bot.quit();if(failure)process.exitCode=1;}
 }
}
main().catch(error=>{output({error:error.message});console.error(error);process.exitCode=1;});

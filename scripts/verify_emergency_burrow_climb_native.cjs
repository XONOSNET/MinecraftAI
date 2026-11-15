// Two-block survival exit replay using a disposable Paper server on loopback.
const assert=require('node:assert/strict'),{once}=require('node:events'),{readFileSync}=require('node:fs');
const mineflayer=require('mineflayer'),{Rcon}=require('rcon-client'),{Vec3}=require('vec3');
const burrow=require('../controller/emergency_burrow'),access=require('../controller/resource_access');
const inventory=require('../controller/inventory_sync'),{createMotor}=require('../controller/locomotion');
const {apply,defaults}=require('../controller/behavior');

const host='127.0.0.1',gamePort=25571,rconPort=25572,username='LabShaftFixture';
const properties=readFileSync('logs/survival-paper-fixture/server.properties','utf8');
assert.match(properties,/^server-port=25571\r?$/m);
assert.match(properties,/^rcon\.port=25572\r?$/m);
const password=properties.match(/^rcon\.password=(.+)\r?$/m)?.[1].trim();
assert.ok(password,'isolated fixture RCON password');
const cases=[
 {trial:934,bot:'LabAI3',surface:64,x:.494864763743,z:.502924975703,dirt:2,yaw:-1.0524335123208237,lip:[0,0,1]},
 {trial:924,bot:'LabAI6',surface:71,x:.48717601206,z:.538914798155,dirt:59,yaw:-.018325957145936655,lip:[-1,0,0],behavior:{aim_pitch_deg_per_sec:195,walk_yaw_deg_per_sec:570}},
];
const filters=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const carryLight=process.argv.includes('--carried-light');
const lateLook=process.argv.includes('--late-look');
const selected=cases.filter(c=>!filters.length||filters.includes(String(c.trial)));
assert.ok(selected.length,'expected trial 934 or 924');
const countDirt=b=>b.inventory.items().filter(i=>i.name==='dirt').reduce((n,i)=>n+i.count,0);
const livePose=b=>({position:b.entity.position.toArray(),velocity:b.entity.velocity.toArray(),grounded:b.entity.onGround});

async function replay(b,motor,command,source){
 const {trial,bot,surface,x,z,dirt,yaw,lip,behavior}=source;
 const feet=new Vec3(128,surface,128),bottom=feet.offset(0,-2,0),top=feet.offset(0,-1,0);
 const lower=feet.offset(-2,-4,-2),upper=feet.offset(2,3,2);
 const volume=[];
 for(let i=lower.x;i<=upper.x;i++)for(let j=lower.y;j<=upper.y;j++)for(let k=lower.z;k<=upper.z;k++)volume.push(new Vec3(i,j,k));
 const result={trial,bot,dirt,attempts:[],carried_light:carryLight,late_look:lateLook};
 let attempt,readyForCleanup=false;
 let lightPlaced=false;
 const write=b._client.write;
 b._client.write=function(name,packet){
  if(attempt&&name==='block_place')attempt.writes.push({...livePose(b),support:packet.location.toArray(),face:packet.direction});
  return write.call(this,name,packet);
 };
 const lookAt=b.lookAt;
 b.lookAt=async function(...args){
  // Reproduce a delayed completion of the second, in-air aim. The native
  // movement, placement response, inventory and landing still come from Paper.
  if(lateLook&&attempt&&!b.entity.onGround){
   attempt.delayed_look_at=livePose(b);
   await b.waitForTicks(8);
  }
  return lookAt.apply(this,args);
 };
 const physics=()=>{
  if(!attempt)return;
  const {position,velocity,grounded}=livePose(b);
  if(attempt.samples.at(-1)?.position[1]!==position[1]||attempt.samples.at(-1)?.grounded!==grounded)attempt.samples.push({position,velocity,grounded});
 };
 const update=(_old,block)=>{
  if(attempt&&block?.position.equals(attempt.target))attempt.updates.push({block:block.name,...livePose(b)});
 };
 const jumpPlace=access.jumpPlace;
 access.jumpPlace=async(bot,position,item)=>{
  attempt={target:position,initial:livePose(b),samples:[],writes:[],updates:[]};
  result.attempts.push(attempt);
  try{attempt.placed=await jumpPlace(bot,position,item);return attempt.placed;}
  finally{attempt.final=livePose(b);attempt=null;}
 };
 b.on('physicsTick',physics);
 b.on('blockUpdate',update);
 try{
  await command(`gamemode creative ${username}`);
  await command(`tp ${username} ${feet.offset(.5,5,.5).toArray().join(' ')}`);
  await b.waitForChunksToLoad();await b.waitForTicks(5);
  assert.ok(volume.every(q=>b.blockAt(q)?.name==='air'),'disposable volume starts empty');
  readyForCleanup=true;
  await command(`fill ${lower.toArray().join(' ')} ${feet.offset(2,-1,2).toArray().join(' ')} minecraft:dirt`);
  await command(`fill ${bottom.toArray().join(' ')} ${top.toArray().join(' ')} minecraft:air`);
  await command(`clear ${username}`);
  await command(`tp ${username} ${bottom.offset(x,0,z).toArray().join(' ')} ${-yaw*180/Math.PI} 0`);
  await b.waitForTicks(5);
  await command(`gamemode survival ${username}`);
  await command(`give ${username} minecraft:dirt ${dirt}`);
  await b.waitForTicks(6);await inventory.sync(b);
  apply(b,{revision:'native-burrow-climb-replay',values:{...defaults,...behavior}});
  assert.equal(countDirt(b),dirt);
  assert.equal(b.entity.onGround,true);
  assert.equal(b.entity.position.y,bottom.y);
  const s={feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(...lip).toArray(),stage:'climb',shellVerified:true,resume:'gather',progressAt:Date.now()};
  const t={phase:'night_burrow',plot:{x:155,y:surface,z:155},campPlots:[],milestones:[],wilderness:{burrow:s},navigator:{lastPlan:0}};
  const state={run:'native-burrow-climb',world:{bounds:[112,144,112,144],first_night:{hostiles:true}}};
  const started=Date.now();
  while(t.wilderness.burrow&&Date.now()-started<45000){
   if(carryLight&&!lightPlaced&&b.entity.onGround&&b.entity.position.y===top.y){
    await command(`setblock ${feet.toArray().join(' ')} minecraft:light[level=14]`);
    await b.waitForTicks(3);
    assert.equal(b.blockAt(feet)?.name,'light');lightPlaced=true;
   }
   await burrow.tick(t,b,motor,state);await b.waitForTicks(1);
   if(lateLook&&result.attempts.at(-1)?.placed===false)break;
  }
  result.duration_ms=Date.now()-started;
  result.final={...livePose(b),phase:t.phase,dirt:countDirt(b),steps:[bottom,top].map(q=>b.blockAt(q)?.name),message:t.message};
  assert.equal(t.wilderness.burrow,null,'the opened burrow must resume the interrupted lesson');
  assert.equal(t.phase,'gather');
  assert.deepEqual(t.milestones,[]);
  assert.equal(b.game.gameMode,'survival');
  assert.equal(b.entity.position.y,surface);
  assert.equal(b.entity.onGround,true);
  assert.equal(countDirt(b),dirt-2);
  assert.deepEqual(result.final.steps,['dirt','dirt']);
  assert.equal(lightPlaced,carryLight);
  assert.equal(result.attempts.filter(a=>a.updates.some(u=>u.block==='dirt')).length,2);
  result.passed=true;
 }catch(error){
  result.error=error.message;result.failure={...livePose(b),dirt:countDirt(b)};
 }finally{
  access.jumpPlace=jumpPlace;
  b._client.write=write;
  b.lookAt=lookAt;
  b.removeListener('physicsTick',physics);
  b.removeListener('blockUpdate',update);
  motor.pause();
  await command(`gamemode creative ${username}`);
  await command(`tp ${username} ${feet.offset(.5,5,.5).toArray().join(' ')}`);
  await command(`clear ${username}`);
  if(readyForCleanup){
   await command(`fill ${lower.toArray().join(' ')} ${upper.toArray().join(' ')} minecraft:air`);
   await command(`kill @e[type=minecraft:item,x=${lower.x},y=${lower.y},z=${lower.z},dx=4,dy=7,dz=4]`);
   await b.waitForTicks(5);
   assert.ok(volume.every(q=>b.blockAt(q)?.name==='air'),'verified disposable volume cleanup');
  }
  result.cleaned=readyForCleanup;
  console.log(JSON.stringify(result));
 }
 return result.passed;
}

async function main(){
 const rcon=await Rcon.connect({host,port:rconPort,password});
 const b=mineflayer.createBot({host,port:gamePort,username,auth:'offline',version:'1.21.4'});
 const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});
 inventory.attach(b);b.on('physicsTick',()=>motor.tick());
 try{
  await once(b,'spawn');
  const command=cmd=>rcon.send(cmd);
  for(const entry of selected)if(!await replay(b,motor,command,entry))process.exitCode=1;
 }finally{b.quit();await rcon.end();}
}

const timer=setTimeout(()=>{console.error('Disposable Paper replay timed out');process.exit(1);},120000);
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(timer));

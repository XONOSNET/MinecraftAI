'use strict';

// Supplied home/shaft/stock/log and forced death are isolated test conditions.
// Native inventory, walking, entry, excavation and pickup remain real mechanics.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const mf=require('mineflayer'),{Vec3}=require('vec3');
const {PilotLife,actualItems}=require('../pilot/life.cjs'),{open}=require('../pilot/state.cjs');
const inventory=require('../controller/inventory_sync');
const output=path.resolve(process.argv[2]),channel=path.resolve(process.argv[3]);
if(!output.startsWith(path.resolve('logs')+path.sep)||!channel.startsWith(output+path.sep))throw Error('Private fixture paths required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={complete:false,setup_is_autonomous_achievement:false,started_at:Date.now(),trace:[]};
let bot,motor,life,store,respawnPromise=null;
const record=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const pose=()=>({position:bot.entity.position.toArray(),grounded:bot.entity.onGround,health:bot.health,food:bot.food,inventory:actualItems(bot)});
async function until(check,ms,label){const end=Date.now()+ms;while(Date.now()<end){if(report.client_error)throw Error(report.client_error);const value=await check();if(value)return value;await sleep(100);}throw Error('Timed out: '+label);}
async function host(action){
 const id=crypto.randomUUID().replaceAll('-',''),tmp=path.join(channel,id+'.tmp');
 fs.writeFileSync(tmp,JSON.stringify({id,action}));fs.renameSync(tmp,path.join(channel,id+'.request.json'));
 return until(()=>{try{const s=JSON.parse(fs.readFileSync(path.join(channel,id+'.response.json'),'utf8'));if(s.id!==id)return false;if(!s.ok)throw Error(s.error);return s;}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return false;throw e;}},25000,'private '+action);
}
const options={bounds:[-128,128,-128,128],api:async(route,payload)=>{
 report.api_calls??=[];report.api_calls.push({at:Date.now(),route});
 if(route==='/step')return {action:payload.teacher};
 if(route==='/world/report')return {};
 throw Error('Respawn fixture refuses unverified native operation '+route);
},scan:require('../controller/perception').scan,tasks:require('../controller/tasks')};
(async()=>{
 try{
  report.sources=Object.fromEntries(['pilot/life.cjs','pilot/state.cjs',...['py','cjs'].map(x=>'scripts/verify_pilot_respawn_recovery.'+x)].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
  bot=mf.createBot({host:'127.0.0.1',port:25571,username:'PilotTest01',auth:'offline',version:'1.21.4',respawn:true});
  inventory.attach(bot);require('../controller/resource_space').attach(bot);require('../pilot/neutral_spiders.cjs').attach(bot);
  motor=require('../controller/locomotion').createMotor(bot,{...require('../config/permissions.json'),attack:true,break_blocks:true,place_blocks:true,inventory:true});
  bot.on('physicsTick',()=>motor.tick());bot.on('error',e=>{report.client_error=e.message;});
  bot.on('death',()=>{if(life){life.onDeath('native_fixture_death');report.death=pose();record();}});
  bot.on('spawn',()=>{
   if(!life)return;
   respawnPromise=(async()=>{
    await sleep(700);await inventory.sync(bot);const native=(await host('inspect')).native;
    assert.equal(native.inventory.length,0,'Death must remove supplied carried stock');
    assert.equal(actualItems(bot).length,0,'The protocol inventory must match native empty respawn');
    assert.equal(native.position.world_uuid,report.setup.world_uuid);
    life.onRespawn(bot.entity.position.toArray(),actualItems(bot));report.respawn={native,pose:pose(),life:life.status(),state:store.snapshot()};record();
   })();respawnPromise.catch(e=>{report.client_error=e.stack||e.message;});
  });
  await until(()=>bot.entity&&bot.game,15000,'native admission');await sleep(800);
  const setup=await host('setup');report.setup=setup;await sleep(700);await inventory.sync(bot);
  await until(()=>bot.entity.onGround&&Math.abs(bot.entity.position.y-(setup.old_feet[1]-2))<.1,5000,'old shaft footing');
  const scope={worldKey:setup.world_uuid+'/'+bot._client.uuid,identity:bot.username},filename=path.join(output,'state.json');
  store=open(filename,scope);store.markSession('native-respawn-test');
  store.update({ownership:{plot:setup.home},construction:{phase:'night_burrow',established:false,
   intendedFeatures:['chest','furnace','bed_home'],workPhase:'gather',
   burrow:{feet:setup.old_feet,cap:setup.old_feet,lip:[setup.old_feet[0]-1,setup.old_feet[1],setup.old_feet[2]],stage:'seal',resume:'gather',reason:'Fixture interrupted sealing'}},
   goal:{kind:'survival',status:'working'}},'supplied_fixture_claims');
  life=new PilotLife(bot,motor,store,options);assert.equal(life.teacher.wilderness.burrow?.stage,'seal');
  life.save(true);report.before=pose();assert.ok(report.before.inventory.length>0);
  await host('kill');await until(()=>respawnPromise!==null,10000,'native respawn event');await respawnPromise;
  assert.equal(life.recovering,true);assert.ok(life.teacher.wilderness.burrow==null);
  assert.deepEqual(life.teacher.plot,setup.home);assert.notEqual(life.teacher.phase,'night_burrow');
  life.save(true);const beforeReload=store.snapshot();motor.pause();
  store=open(filename,scope);life=new PilotLife(bot,motor,store,options);
  assert.equal(life.recovering,true);assert.ok(life.teacher.wilderness.burrow==null);
  report.restart={home_retained:JSON.stringify(life.teacher.plot)===JSON.stringify(setup.home),recovery_required:life.recovering,
   phase:life.teacher.phase,burrow:life.teacher.wilderness.burrow,metrics:store.snapshot().metrics};
  const started=Date.now(),start=bot.entity.position.clone();
  await until(async()=>{await life.tick();report.trace.push({at:Date.now(),pose:pose(),goal:life.currentGoal,phase:life.teacher.phase,message:life.message,burrow:life.teacher.wilderness.burrow?.feet});record();return !life.recovering;},90000,'checked return after native empty-inventory respawn');
  motor.pause();report.recovery={elapsed_ms:Date.now()-started,pose:pose(),state:store.snapshot(),distance_travelled:start.distanceTo(bot.entity.position)};
  assert.equal(store.snapshot().recovery.lastOutcome.outcome,'returned_to_owned_home');
  assert.equal(store.snapshot().metrics.deaths,1);assert.equal(store.snapshot().metrics.recoveries,1);
  assert.equal(store.snapshot().metrics.repeatedStalls,beforeReload.metrics.repeatedStalls);
  assert.ok(report.recovery.distance_travelled>5);assert.ok(life.teacher.wilderness.burrow==null);
  const t=life.teacher,target=new Vec3(...setup.test_log),state=life.frame;
  await until(async()=>await t.walk(bot,motor,[target.x-1.5,target.y+.1,target.z+.5],state,life.api,options.scan,options.tasks)===true,45000,'checked route to interrupted gathering work');
  motor.pause();assert.equal(bot.blockAt(target).name,'oak_log');
  await bot.lookAt(target.offset(.5,.5,.5),true);await bot.dig(bot.blockAt(target),true);
  await until(async()=>{await t.walk(bot,motor,[target.x+.5,target.y+.1,target.z+.5],state,life.api,options.scan,options.tasks);return bot.inventory.items().some(i=>i.name==='oak_log'&&i.count>0);},12000,'real post-recovery log pickup');
  motor.pause();report.resumed_gathering={pose:pose(),target:setup.test_log,setup_resource:true};
  assert.equal(bot.health,20);assert.equal(bot.game.gameMode,'survival');report.complete=true;
 }catch(e){report.error=e.stack||e.message;process.exitCode=1;}
 finally{motor?.pause();bot?.quit('Private respawn recovery complete');await sleep(500);report.finished_at=Date.now();record();console.log(JSON.stringify({complete:report.complete,error:report.error,recovery_ms:report.recovery?.elapsed_ms,cleanup_actor_disconnected:true}));setTimeout(()=>process.exit(process.exitCode||0),300);}
})().catch(e=>{console.error(e);process.exitCode=1;});
const deadline=setTimeout(()=>{report.error='Private respawn actor deadline';record();motor?.pause();bot?.quit();process.exit(1);},210000);deadline.unref();

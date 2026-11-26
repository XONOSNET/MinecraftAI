'use strict';

// Destructive lifecycle checks are restricted to a private Paper fixture. The
// supplied house/materials are test conditions, never autonomous achievements.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PilotSupervisor,HttpBridge,inventory}=require('../pilot/index.cjs');
const {Vec3}=require('vec3');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.resolve(process.argv[2]||'logs/persistent-pilot-native');
if(!output.startsWith(path.join(root,'logs')+path.sep))throw Error('Native evidence must remain under logs');
fs.mkdirSync(output,{recursive:true});
const token=process.env.PILOT_FIXTURE_TOKEN_FILE;
if(!token)throw Error('Provide the isolated fixture token file');
const bridge=new HttpBridge('http://127.0.0.1:8102',token),world=process.env.PILOT_FIXTURE_WORLD||'lab_pilot_fixture_lifecycle',identity='PilotTest01';
const report={started:new Date().toISOString(),world,identity,fixtureSetup:[],scenarios:[],complete:false};
report.sources=Object.fromEntries(['pilot/index.cjs','pilot/life.cjs','pilot/state.cjs','scripts/verify_persistent_pilot_native.cjs'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
report.controller_revision=require('../controller/controller_revision');
const write=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
let supervisor,deadline=Date.now()+20*60000;
let pulsing=false;
async function pulse(){if(!supervisor||pulsing)return;pulsing=true;try{await supervisor.pulse();}finally{pulsing=false;}}
const heartbeat=setInterval(()=>pulse().catch(error=>{report.heartbeat_error=error.message;}),500);
const options={fixture:true,world,identity,serverPort:25571,bridge,directory:path.join(output,'state'),logs:path.join(output,'events')};
async function command(action,extra={}) {const result=await bridge.world({action,world,...extra});if(action==='fixture')report.fixtureSetup.push(result);return result;}
async function until(predicate,ms,label,{work=false}={}) {
  const stop=Math.min(deadline,Date.now()+ms);let nextPulse=0;
  while(Date.now()<stop) {
    if(supervisor?.resourceHold)throw Error('Native fixture resource veto: '+JSON.stringify(supervisor.health));
    if(await predicate())return;
    if(supervisor&&Date.now()>=nextPulse){nextPulse=Date.now()+500;await pulse();}
    if(work&&supervisor?.ready) {
      let timeout;
      try{await Promise.race([supervisor.decision(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Native decision exceeded bounded supervision')),65000);})]);}
      finally{clearTimeout(timeout);}
    }
    await sleep(200);
  }
  throw Error('Bounded native check timed out: '+label);
}
async function scenario(name,body) {
  const row={name,started:new Date().toISOString()};report.scenarios.push(row);write();
  try{row.evidence=await body();row.passed=true;}
  catch(error){row.passed=false;row.error=error.stack||error.message;throw error;}
  finally{row.finished=new Date().toISOString();write();}
}
function assertScope(actual) {
  assert.equal(actual.position.world_uuid,supervisor.control.world_uuid);
  assert.equal(actual.player_uuid,supervisor.control.player_uuid);
}
async function actual(){const p=await command('player',{player:identity});assertScope(p);return p;}
async function hostAction(route,payload) {
  const response=await fetch('http://127.0.0.1:8102'+route,{method:'POST',headers:{'X-Lab-Token':fs.readFileSync(token,'utf8').trim(),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error('Private fixture lifecycle refused: '+await response.text());return response.json();
}
async function chestContents() {
  const plot=supervisor.store.snapshot().ownership.plot;
  const container=await supervisor.bot.openContainer(supervisor.bot.blockAt(new Vec3(plot.x+2,plot.y,plot.z+2)));
  try{return container.slots.slice(0,container.inventoryStart).filter(Boolean).map(i=>({name:i.name,count:i.count}));}
  finally{await supervisor.bot.closeWindow(container);}
}
async function connected(){await until(()=>supervisor.ready,25000,'verified fixture connection');}
async function revalidateEngine() {
  // Reload the fixture's explicit initial memory as a real controller startup;
  // do not mutate an already-constructed planner behind its in-memory state.
  const fixtureClaim=supervisor.store.snapshot();
  await supervisor.close();
  supervisor.store.update({ownership:fixtureClaim.ownership,construction:fixtureClaim.construction,goal:fixtureClaim.goal},'fixture_initial_claims_while_controller_stopped');
  await sleep(1500);supervisor=new PilotSupervisor(options);await pulse();await connected();
  await sleep(1600);
}

async function main(){
  const health=await bridge.health();report.preflight=health;
  assert.equal(health.server.ready,true);assert(health.ram_percent<89,'Fixture ongoing memory guard vetoed the native check');
  const realm=await command('create',{terrain:'flat',seed:20261125});report.world_uuid=realm.world_uuid;
  const setup=await command('fixture',{operation:'setup_home'}),plot=setup.home;
  await command('fixture',{operation:'resources'});
  supervisor=new PilotSupervisor(options);await supervisor.start();await supervisor.pulse();await connected();
  const admission=await actual(),feet=supervisor.bot.entity.position.floored();
  assert.equal(admission.health,20,'Fixture admission must start healthy; inspect own damage telemetry if setup is unsafe');
  assert.equal(supervisor.bot.blockAt(feet)?.boundingBox,'empty','Fixture spawn footing must leave feet clear');
  assert.equal(supervisor.bot.blockAt(feet.offset(0,1,0))?.boundingBox,'empty','Fixture spawn must leave headroom');
  report.admission=admission;
  await command('fixture',{operation:'position_home',player:identity});await command('fixture',{operation:'supply',player:identity});
  await sleep(1000);
  supervisor.store.update({ownership:{plot,blueprint:'shared-house-7x7-v1'},construction:{established:true,intendedFeatures:['chest','furnace','bed_home'],phase:'night_recover'},goal:{kind:'repair_home',status:'pending'}},'fixture_supplied_home_claim');
  await revalidateEngine();
  const container=await supervisor.bot.openContainer(supervisor.bot.blockAt(new Vec3(plot.x+2,plot.y,plot.z+2)));
  try{await container.deposit(supervisor.bot.registry.itemsByName.oak_planks.id,null,1);}
  finally{await supervisor.bot.closeWindow(container);}
  report.fixtureSetup.push({operation:'real_deposit_of_one_supplied_plank',autonomous_achievement:false,contents:await chestContents()});
  const originalUUID=supervisor.control.player_uuid;
  await scenario('disconnect_retains_home_and_unfinished_goal',async()=>{
    supervisor.life.save(true);const before=supervisor.store.snapshot();
    await supervisor.disconnect('fixture_disconnect');await sleep(1500);await supervisor.connect();await connected();
    const after=supervisor.store.snapshot();assert.deepEqual(after.ownership.plot,before.ownership.plot);assert.equal(supervisor.control.player_uuid,originalUUID);
    assert.equal(after.construction.established,true);assert.equal(after.goal.kind,before.goal.kind);
    return {beforeGoal:before.goal,afterGoal:after.goal,actual:await actual()};
  });
  await scenario('controller_restart_preserves_scope_and_construction',async()=>{
    const before=supervisor.store.snapshot();await supervisor.close();await sleep(1500);
    supervisor=new PilotSupervisor(options);assert.equal(supervisor.control.enabled,true);await supervisor.pulse();await connected();
    const after=supervisor.store.snapshot();assert.deepEqual(after.ownership.plot,before.ownership.plot);assert.equal(supervisor.control.player_uuid,originalUUID);
    assert.equal(after.goal.kind,before.goal.kind);
    return {world_uuid:supervisor.control.world_uuid,player_uuid:originalUUID,phase:after.construction.phase,actual:await actual()};
  });
  await scenario('stop_during_spawn_readback_cannot_reactivate_resident',async()=>{
    await supervisor.disconnect('fixture_pause_race_setup');await sleep(1500);
    const original=bridge.world.bind(bridge);let unblock,seen=false,capture=true;
    const blocked=new Promise(resolve=>{unblock=resolve;});
    bridge.world=async payload=>{const reply=await original(payload);
      if(capture&&payload.action==='player'&&reply.online){capture=false;seen=true;await blocked;throw Error('Injected obsolete spawn readback failure');}return reply;};
    let paused;
    try {
      await supervisor.connect();await until(()=>seen,15000,'pending native spawn readback');
      await supervisor.stop();await sleep(800);
      assert.equal(supervisor.control.enabled,false);assert.equal(supervisor.ready,false);assert.equal(supervisor.bot,null);assert.equal(supervisor.life,null);
      paused={enabled:supervisor.control.enabled,ready:supervisor.ready};
      await supervisor.start();await connected();const currentBot=supervisor.bot;
      unblock();await sleep(600);assert.equal(supervisor.ready,true);assert.equal(supervisor.bot,currentBot,'An obsolete rejected readback cannot disconnect the new session');
    }finally{unblock();bridge.world=original;}
    return {paused,obsolete_rejection_ignored:true,after:await actual()};
  });
  await scenario('private_server_restart_preserves_world_storage_and_home',async()=>{
    const before=supervisor.store.snapshot(),contents=await chestContents();assert(contents.some(i=>i.name==='oak_planks'&&i.count===1));
    const restart=await hostAction('/fixture/restart');await connected();
    assert.equal(supervisor.control.world_uuid,report.world_uuid);assert.equal(supervisor.control.player_uuid,originalUUID);
    assert.deepEqual(supervisor.store.snapshot().ownership.plot,before.ownership.plot);
    assert.deepEqual(await chestContents(),contents);return {restart,contents,actual:await actual()};
  });
  await scenario('production_style_time_command_cannot_reset_owned_realm',async()=>{
    const proof=await hostAction('/fixture/verify-time-guard',{world});assert.equal(proof.ok,true);return proof;
  });
  await scenario('valid_native_bed_death_and_recovery',async()=>{
    await command('fixture',{operation:'position_home',player:identity});await sleep(500);
    const proof=await supervisor.registerBed([plot.x+2,plot.y,plot.z-1]);assert(proof.server_confirmed);
    // Keep dropped setup items away from the bed so the first native inventory
    // read cannot be confused with an immediate legitimate pickup.
    await command('fixture',{operation:'position_spawn',player:identity});await sleep(400);
    const before=await actual();assert(before.inventory.length>0,'Fixture loadout must exist before death');
    await command('fixture',{operation:'kill',player:identity});
    await until(()=>!supervisor.ready,5000,'death observed');await connected();const respawn=await actual();
    assert.equal(respawn.inventory.length,0,'Native death must remove carried fixture items');
    assert(Math.hypot(respawn.position.x-plot.x,respawn.position.z-plot.z)<7,'Valid bed must produce a home respawn');
    assert.equal(supervisor.life.recovering,true);
    await supervisor.disconnect('fixture_interruption_during_recovery');await sleep(1500);await supervisor.connect();await connected();
    assert.equal(supervisor.life.recovering,true,'Reconnect must retain unfinished death recovery');
    await until(()=>supervisor.life&&!supervisor.life.recovering,100000,'useful recovery after valid bed death',{work:true});
    return {before,respawn,recovery:supervisor.store.snapshot().recovery,after:await actual()};
  });
  await scenario('roof_damage_repairs_one_real_component',async()=>{
    await command('fixture',{operation:'supply',player:identity});await require('../controller/inventory_sync').sync(supervisor.bot);
    await command('fixture',{operation:'damage_roof'});await sleep(400);
    const roof=new Vec3(plot.x,plot.y+3,plot.z),before=await actual();
    assert.equal(supervisor.bot.blockAt(roof).name,'air');
    await until(()=>supervisor.bot.blockAt(roof)?.name==='oak_planks',90000,'targeted roof repair',{work:true});
    const after=await actual();return {before,after,repaired:supervisor.bot.blockAt(roof).name,home:supervisor.life.status().home_verification};
  });
  await scenario('destroyed_bed_preserves_home_and_checked_return',async()=>{
    await command('fixture',{operation:'destroy_bed'});await sleep(400);
    const home=supervisor.store.snapshot().ownership.plot;await command('fixture',{operation:'kill',player:identity});
    await until(()=>!supervisor.ready,5000,'second death observed');await connected();const respawn=await actual();
    const spawn=supervisor.world.spawn;assert(Math.hypot(respawn.position.x-spawn.x,respawn.position.z-spawn.z)<12,'Destroyed bed must use realm spawn');
    assert.deepEqual(supervisor.store.snapshot().ownership.plot,home);
    // Items from the first genuine death can still lie at realm spawn. Native
    // pickups are consequences to observe, not evidence of a supplied respawn.
    await until(()=>supervisor.life&&!supervisor.life.recovering,100000,'checked return or physically verified fallback',{work:true});
    return {respawn,priorDeathDropsMayBePickedUp:respawn.inventory.length>0,recovery:supervisor.store.snapshot().recovery,after:await actual(),homeRetained:supervisor.store.snapshot().ownership.plot};
  });
  await scenario('missing_bed_and_access_resume_real_material_repair',async()=>{
    await command('fixture',{operation:'supply',player:identity});await command('fixture',{operation:'damage_access'});
    await require('../controller/inventory_sync').sync(supervisor.bot);
    const door=new Vec3(plot.x,plot.y,plot.z-3),bed=new Vec3(plot.x+2,plot.y,plot.z-1),before=await actual();
    await until(()=>supervisor.bot.blockAt(door)?.name==='oak_door'&&supervisor.bot.blockAt(bed)?.name.endsWith('_bed'),240000,'real-material bed and doorway repair',{work:true});
    await until(()=>!!supervisor.life.bedProof,30000,'replacement bed native confirmation',{work:true});
    return {before,after:await actual(),proof:supervisor.life.bedProof,metrics:supervisor.store.snapshot().metrics};
  });
  report.complete=true;
}
main().catch(error=>{report.error=error.stack||error.message;process.exitCode=1;}).finally(async()=>{
  clearInterval(heartbeat);
  try{
    if(supervisor){await supervisor.close({preserveEnabled:false});await sleep(1800);}
    const state=await command('player',{player:identity});assert.equal(state.online,false);
    if(report.world_uuid){await command('unload');await command('retire');}
    report.cleanup={verified:true,online:false,world_unloaded:!!report.world_uuid};
  }catch(error){report.cleanup={verified:false,error:error.message};process.exitCode=1;}
  report.finished=new Date().toISOString();write();console.log(JSON.stringify({complete:report.complete,scenarios:report.scenarios.map(r=>({name:r.name,passed:r.passed,error:r.error})),cleanup:report.cleanup,error:report.error}));
});

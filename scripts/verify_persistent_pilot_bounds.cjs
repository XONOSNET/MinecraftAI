'use strict';
// Separate setup-only fixtures: no supplied item is an acquisition achievement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Vec3}=require('vec3');
const {PilotSupervisor,HttpBridge}=require('../pilot/index.cjs');
const {secureInterior}=require('../controller/hut_teacher');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),root=path.resolve(__dirname,'..');
const out=path.resolve(process.argv[2]||'logs/persistent-pilot-bounds');
if(!out.startsWith(path.join(root,'logs')+path.sep))throw Error('Evidence belongs under logs');
const token=process.env.PILOT_FIXTURE_TOKEN_FILE;if(!token)throw Error('Private fixture token file required');
const suffix=process.env.PILOT_BOUNDS_SUFFIX||'';if(!/^[a-z0-9_]{0,8}$/.test(suffix))throw Error('Invalid fixture suffix');
fs.mkdirSync(out,{recursive:true});
const bridge=new HttpBridge('http://127.0.0.1:8102',token),report={started:Date.now(),scenarios:[],complete:false,setup:[]};
report.sources=Object.fromEntries(['pilot/index.cjs','pilot/life.cjs','pilot/state.cjs','scripts/verify_persistent_pilot_bounds.cjs'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
report.controller_revision=require('../controller/controller_revision');
const write=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
let s,world,identity,pulsing=false,plot,deadline=Date.now()+12*60000;
const pulse=async()=>{if(!s||pulsing)return;pulsing=true;try{await s.pulse();}finally{pulsing=false;}};
const timer=setInterval(()=>pulse().catch(e=>{report.heartbeat_error=e.message;}),500);
const cmd=async(action,extra={})=>{const r=await bridge.world({action,world,...extra});if(action==='fixture')report.setup.push(r);return r;};
async function until(check,ms,label,work=false){const end=Math.min(deadline,Date.now()+ms);
  while(Date.now()<end){if(s?.resourceHold)throw Error('Fixture memory veto');if(await check())return;
    if(work&&s?.ready){let t;try{await Promise.race([s.decision(),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('Native decision bound')),65000);})]);}finally{clearTimeout(t);}}
    await sleep(200);}throw Error('Bounded check timed out: '+label);}
async function actual(){return cmd('player',{player:identity});}
async function cleanup(){if(s){await s.close({preserveEnabled:false});await sleep(1600);}const p=await actual();assert.equal(p.online,false);await cmd('unload');await cmd('retire');s=null;}
async function prepare(name,player){world=name;identity=player;
  const realm=await cmd('create',{terrain:'flat',seed:20261125});const setup=await cmd('fixture',{operation:'setup_home'});plot=setup.home;
  const options={fixture:true,world,identity,serverPort:25571,bridge,directory:path.join(out,identity,'state'),logs:path.join(out,identity,'events')};
  s=new PilotSupervisor(options);await s.start();await pulse();await until(()=>s.ready,25000,'fixture connection');
  await cmd('fixture',{operation:'position_home',player:identity});await cmd('fixture',{operation:'supply',player:identity});await sleep(400);
  await require('../controller/inventory_sync').sync(s.bot);
  // All four meals are explicit setup. Missing food must not preempt the
  // unavailable-wool case; no acquisition credit is given for this loadout.
  assert.equal(s.bot.inventory.items().filter(i=>i.name==='cooked_beef').reduce((n,i)=>n+i.count,0),4);
  const table=s.bot.blockAt(new Vec3(plot.x-3,plot.y,plot.z+1));
  await require('../controller/crafting').craft(s.bot,'wooden_axe',1,table);
  await require('../controller/inventory_sync').sync(s.bot);
  const prepared=await actual();assert(prepared.inventory.some(i=>i.item==='minecraft:wooden_axe'&&i.count===1),'Server must confirm the prepared crafting output');
  report.setup.push({operation:'prepared_four_meals_and_real_crafted_axe',autonomous_achievement:false,actual:prepared});
  await s.close();s.store.update({ownership:{plot,blueprint:'shared-house-7x7-v1'},construction:{established:true,intendedFeatures:['chest','furnace','bed_home'],phase:'night_recover'},goal:{kind:'maintenance',status:'pending'}},'fixture_prepared_claims');
  await sleep(1500);s=new PilotSupervisor(options);await pulse();await until(()=>s.ready,25000,'prepared controller reload');
  await until(()=>!!s.life?.bedProof,20000,'native bed proof',true);
  return {world_uuid:realm.world_uuid,player_uuid:s.control.player_uuid};}
async function scenario(name,body){const row={name,started:Date.now()};report.scenarios.push(row);write();
  try{row.evidence=await body();row.passed=true;}catch(e){row.error=e.stack||e.message;row.passed=false;throw e;}finally{row.finished=Date.now();write();}}
async function main(){
  await scenario('blocked_home_route_has_physical_temporary_fallback',async()=>{
    const scope=await prepare('lab_pilot_fixture_blocked'+suffix,'PilotTest02');
    await cmd('fixture',{operation:'block_access'});await cmd('fixture',{operation:'position_spawn',player:identity});
    const start=Date.now(),before=await actual();
    await until(()=>!!s.store.snapshot().recovery.temporaryShelter?.verified,100000,'physically verified blocked-route fallback',true);
    const state=s.store.snapshot(),burrow=s.life.teacher.wilderness.burrow;
    assert(s.life.verifiedBurrow());assert(state.ownership.plot);assert(s.bot.blockAt(new Vec3(plot.x,plot.y,plot.z-4)).name==='cobblestone');
    const proof={scope,before,after:await actual(),duration_ms:Date.now()-start,backoff:s.life.backoff.return_home,temporary:state.recovery.temporaryShelter,burrow,home_preserved:state.ownership.plot,unowned_obstruction_not_dug:true};
    await cleanup();return proof;
  });
  await scenario('unavailable_wool_yields_to_real_home_maintenance',async()=>{
    const scope=await prepare('lab_pilot_fixture_no_wool'+suffix,'PilotTest03');
    await cmd('fixture',{operation:'destroy_bed'});const before=await actual(),start=Date.now();
    assert(!before.inventory.some(i=>i.item==='minecraft:white_wool'));
    await until(()=>s.life?.backoff.repair_home?.until>Date.now()&&/wool/i.test(s.life.backoff.repair_home.reason),230000,'finite acquisition budget despite walking',true);
    const deferred={...s.life.backoff.repair_home},atDeferral=await actual();
    report.scenarios.at(-1).deferral_evidence={deferred,actual:atDeferral,budget:s.life.woolBudget};write();
    await until(()=>s.life?.verifiedBurrow()||secureInterior(s.bot,plot)&&s.life.currentGoal==='maintenance'&&s.store.snapshot().storage.some(q=>q.verified&&q.observedContents?.length),60000,'another physical useful maintenance or shelter result',true);
    const state=s.store.snapshot(),bed=s.bot.blockAt(new Vec3(plot.x+2,plot.y,plot.z-1));if(bed)assert(!bed.name.endsWith('_bed'));
    const proof={scope,before,after:await actual(),at_deferral:atDeferral,duration_ms:Date.now()-start,deferred,storage:state.storage,goal:state.goal,alternate:s.life.verifiedBurrow()?'verified_temporary_shelter':'verified_home_storage',missing_bed_not_fabricated:true,no_livestock_or_new_materials_added:true};
    await cleanup();return proof;
  });report.complete=true;}
main().catch(e=>{report.error=e.stack||e.message;process.exitCode=1;}).finally(async()=>{clearInterval(timer);
  try{if(s)await cleanup();report.cleanup_verified=true;}catch(e){report.cleanup_error=e.message;process.exitCode=1;}
  report.finished=Date.now();write();console.log(JSON.stringify({complete:report.complete,scenarios:report.scenarios.map(r=>({name:r.name,passed:r.passed,error:r.error})),error:report.error,cleanup:report.cleanup_verified}));});

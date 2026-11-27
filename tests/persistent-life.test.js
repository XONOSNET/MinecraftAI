'use strict';

// These are planner/lifecycle regressions, not evidence of autonomous material
// acquisition. Destructive native and genuine survival checks use Paper.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Vec3}=require('vec3');
const {open}=require('../pilot/state.cjs');
const {PilotLife,chooseGoal,physicalHome,freshTeacher,trackedMine}=require('../pilot/life.cjs');
const house=require('../controller/house'),repair=require('../controller/home_repair');
const firstNight=require('../controller/first_night'),shelter=require('../controller/shelter_policy');

function fixture(ctx,options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persistent-life-'));
  ctx.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let now=Date.now(),items={oak_planks:32,wooden_axe:1,wooden_pickaxe:1,cooked_beef:8};
  const plot={x:0,y:64,z:0},cells=new Map();
  const set=(p,name,props={})=>cells.set(p.floored().toString(),{name,props});
  for(const q of house.blueprint(plot))set(new Vec3(q.x,q.y,q.z),q.table?'crafting_table':'oak_planks');
  set(new Vec3(0,64,-3),'oak_door',{half:'lower',open:false});
  set(new Vec3(0,65,-3),'oak_door',{half:'upper',open:false});
  for(const key of ['chest','furnace'])set(house.point(plot,key),key);
  set(house.point(plot,'bed'),'white_bed',{part:'foot'});
  set(house.point(plot,'bed').offset(0,0,1),'white_bed',{part:'head'});
  for(const side of ['indoor','outdoor']){const mount=house.torchMount(plot,side);set(mount.position,'wall_torch',{facing:mount.facing});}
  const b={username:'PilotTest01',health:20,food:20,players:{},entities:{},time:{timeOfDay:1000},game:{dimension:'minecraft:lab_persistent_pilot',minY:-64},
    entity:{id:1,position:new Vec3(.5,64,.5),onGround:true,velocity:new Vec3(0,0,0)},world:{raycast:()=>null},
    inventory:{slots:[],items:()=>Object.entries(items).filter(([,n])=>n>0).map(([name,count],i)=>({name,count,slot:9+i}))},
    _client:{write(){}},stopDigging(){},deactivateItem(){},craft:async()=>{}};
  b.blockAt=p=>{p=p.floored();const v=cells.get(p.toString())||{name:p.y<64?'dirt':'air',props:{}};
    return {name:v.name,position:p,boundingBox:['air','wall_torch'].includes(v.name)||v.name.endsWith('_door')?'empty':'block',getProperties:()=>v.props};};
  const scope={worldKey:'world-uuid/pilot-test',identity:b.username,clock:()=>now},filename=path.join(dir,'state.json');
  let store=open(filename,scope);
  store.update({ownership:{plot},construction:{phase:'night_scout',established:true,intendedFeatures:['chest','furnace','torch','bed_home']}},'fixture_claims');
  let pauses=0;
  const motor={pause(){pauses++;},lockLook(){},command(){},committedJump:()=>false};
  const api=options.api||(async(_p,d)=>({verified:true,position:d.position}));
  const make=(s=store)=>new PilotLife(b,motor,s,{bounds:[-64,64,-64,64],api,clock:()=>now});
  const engine=make();
  return {b,engine,store,motor,plot,cells,set,filename,scope,make,
    get items(){return items;},set items(value){items=value;},advance(ms){now+=ms;},get now(){return now;},get pauses(){return pauses;}};
}

function quiet(ctx) {
  ctx.mock.method(require('../controller/air_escape'),'tick',()=>false);
  ctx.mock.method(shelter,'assess',()=>({mode:'work'}));
  ctx.mock.method(shelter,'danger',()=>false);
  ctx.mock.method(shelter,'threats',()=>[]);
  ctx.mock.method(firstNight,'interrupt',async()=>false);
}

const basic={alive:true,danger:false,recovering:false,hasPlot:true,established:true,home:{usable:true,missing:[],bed:true},
  meals:8,axe:true,pickaxe:true,bedVerified:true,wood:32,night:false,backoff:{},now:1000};
test('continuing priorities keep immediate survival, physical recovery and safe night cover ahead of useful work',()=>{
  const goal=patch=>chooseGoal({...basic,...patch}).kind;
  assert.equal(goal({alive:false}),'await_respawn');
  assert.equal(goal({danger:true,recovering:true}),'survival');
  assert.equal(goal({recovering:true}),'recover');
  assert.equal(goal({night:true,meals:0,axe:false}),'shelter_watch');
  assert.equal(goal({home:{usable:false,missing:[{kind:'planks'}],bed:true}}),'repair_home');
  assert.equal(goal({meals:0}),'food');assert.equal(goal({axe:false}),'tools');
  assert.equal(goal({wood:0}),'supplies');assert.equal(goal({bedVerified:false}),'register_bed');
  assert.equal(goal({}),'maintenance');
});

test('a deferred unavailable resource permits another useful priority instead of retrying it every tick',()=>{
  const o={...basic,meals:0,axe:false,backoff:{food:{until:10000}}};
  assert.equal(chooseGoal(o).kind,'tools');
  assert.equal(chooseGoal({...o,axe:true,wood:0,backoff:{...o.backoff,tools:{until:10000}}}).kind,'supplies');
  assert.equal(chooseGoal({...basic,home:{usable:false,bed:false,missing:[{}]},
    backoff:{repair_home:{until:10000}}}).kind,'temporary_cover');
});

test('remembered construction is checked live and partial damage identifies only the missing owned parts',ctx=>{
  const f=fixture(ctx),features=['chest','furnace','torch','bed_home'];
  assert.equal(physicalHome(f.b,f.plot,features).usable,true);
  f.set(new Vec3(0,67,0),'air');
  const damaged=physicalHome(f.b,f.plot,features);
  assert.equal(damaged.usable,false);assert.equal(damaged.bed,true);
  assert.deepEqual(damaged.missing.map(q=>[q.x,q.y,q.z]),[[0,67,0]]);
  f.set(new Vec3(0,67,0),'oak_planks');f.set(house.point(f.plot,'bed'),'air');
  const bed=physicalHome(f.b,f.plot,features);assert.equal(bed.usable,true);assert.equal(bed.bed,false);
  assert.deepEqual(bed.missing.map(q=>q.kind),['bed']);
  const blockAt=f.b.blockAt;f.b.blockAt=p=>p.x===3?null:blockAt(p);
  assert.equal(physicalHome(f.b,f.plot,features).loaded,false);
});

test('a two-block entrance crater prevents shelter credit even with an intact house shell',ctx=>{
  const f=fixture(ctx);for(const y of [63,62])f.set(new Vec3(0,y,-4),'air');
  const view=physicalHome(f.b,f.plot,['chest','furnace','torch','bed_home']);
  assert.equal(view.shell,true);assert.equal(view.usable,false);
  assert.ok(view.missing.some(q=>q.terrain&&q.kind==='foundation'));
});

test('disconnect/reload preserves home and unfinished intent without trusting remembered bed or carried supplies',ctx=>{
  const f=fixture(ctx);f.engine.teacher.phase='night_wool';f.engine.currentGoal='repair_home';
  f.engine.homeView=physicalHome(f.b,f.plot,['bed_home']);f.engine.onDisconnect('test reconnect');
  const reloaded=open(f.filename,f.scope),next=f.make(reloaded);
  assert.equal(next.run,f.engine.run);assert.equal(next.teacher.phase,'night_wool');
  assert.deepEqual(next.teacher.plot,f.plot);assert.equal(next.currentGoal,'repair_home');assert.equal(next.bedProof,null);
  assert.equal(reloaded.snapshot().lastObservation.trusted,false);
  assert.equal(reloaded.snapshot().home.verified,false);
  assert.equal(reloaded.snapshot().metrics.disconnects,1);
});

test('death is idempotent and respawn recovery uses actual new inventory while preserving home',ctx=>{
  const f=fixture(ctx);f.engine.currentGoal='supplies';f.engine.teacher.phase='gather';
  f.engine.onDeath('fixture death');f.engine.onDeath('duplicate packet');
  assert.equal(f.store.snapshot().metrics.deaths,1);assert.equal(f.engine.status().state,'awaiting_respawn');
  f.items={};f.b.entity.position=new Vec3(24.5,64,24.5);f.engine.onRespawn(f.b.entity.position,[]);
  assert.equal(f.engine.recovering,true);assert.deepEqual(f.engine.status().inventory,[]);
  assert.deepEqual(f.store.snapshot().recovery.respawn.inventory,[]);
  assert.deepEqual(f.engine.teacher.plot,f.plot);assert.equal(f.engine.bedProof,null);
  assert.equal(f.store.snapshot().resume[0].goal,'supplies');
  f.engine.onDeath('another death');f.engine.onRespawn(f.b.entity.position,[]);
  assert.equal(f.store.snapshot().metrics.deaths,2);assert.equal(f.store.snapshot().metrics.respawns,2);
});

test('death during burrow sealing cannot resume the old shaft after a distant empty respawn',ctx=>{
  const f=fixture(ctx);
  f.b.entity.position=new Vec3(-27.5,70,-71.5);
  f.engine.currentGoal='survival';f.engine.teacher.phase='night_burrow';
  f.engine.teacher.wilderness.burrow={feet:[-28,72,-72],cap:[-28,72,-72],lip:[-28,72,-73],
    stage:'seal',resume:'night_bootstrap',reason:'Taking cover from skeleton'};
  f.engine.onDeath('native death during sealing');
  assert.equal(f.store.snapshot().construction.burrow.stage,'seal','death must first retain the interrupted physical work as an unverified claim');
  f.items={};f.b.entity.position=new Vec3(-16,69,-48);f.engine.onRespawn(f.b.entity.position,[]);
  assert.ok(!f.engine.teacher.wilderness.burrow,'the old shaft is 27 blocks from the actual respawn');
  assert.equal(f.engine.teacher.phase,'gather');assert.equal(f.engine.recovering,true);
  assert.deepEqual(f.engine.status().inventory,[]);assert.deepEqual(f.engine.teacher.plot,f.plot);
  assert.equal(f.store.snapshot().resume[0].phase,'night_burrow');
  assert.equal(f.store.snapshot().construction.burrow,null);
  assert.ok(f.store.snapshot().events.some(e=>e.kind==='remote_burrow_operation_discarded'));
  assert.equal(f.store.snapshot().metrics.recoveries,0,'discarding stale work is not physical recovery');
});

test('reload of an already-stalled recovery rejects the remote saved burrow even when its phase says gather',ctx=>{
  const f=fixture(ctx);f.items={};f.b.entity.position=new Vec3(-16,69,-48);
  f.store.update({construction:{phase:'gather',burrow:{feet:[-28,72,-72],cap:[-28,72,-72],lip:[-28,72,-73],
    stage:'seal',resume:'night_bootstrap'}},recovery:{required:true,phase:'recovering',awaitingRespawn:false,
    death:{number:1,at:f.now,position:[-27.5,72,-71.5]},respawn:{position:[-16,69,-48],inventory:[],fromDeath:true}}});
  const next=f.make(open(f.filename,f.scope));
  assert.ok(!next.teacher.wilderness.burrow);assert.equal(next.teacher.phase,'gather');
  assert.equal(next.store.snapshot().construction.burrow,null);
  assert.ok(next.store.snapshot().events.some(e=>e.kind==='remote_burrow_operation_discarded'));
  next.onRespawn(f.b.entity.position,[]);
  assert.ok(!next.teacher.wilderness.burrow);assert.equal(next.recovering,true);
  assert.deepEqual(next.teacher.plot,f.plot);assert.deepEqual(next.status().inventory,[]);
  assert.equal(next.store.snapshot().metrics.recoveries,0);
});

test('reconnect inside the same shaft retains every local work stage without granting shelter or footing proof',ctx=>{
  const f=fixture(ctx),burrow=require('../controller/emergency_burrow');
  let shellValid=false;
  ctx.mock.method(burrow,'sealed',()=>shellValid);ctx.mock.method(burrow,'walls',()=>shellValid);
  for(const stage of ['dig','lip','seal','hidden','open','reclaim','climb']) {
    shellValid=false;f.b.entity.onGround=true;
    f.b.entity.position=new Vec3(20.5,62,20.5);
    f.store.update({construction:{phase:'night_burrow',burrow:{feet:[20,64,20],cap:[20,64,20],lip:[21,64,20],
      stage,resume:'night_bootstrap',cap_name:'dirt',lip_name:'dirt'}}});
    const next=f.make(open(f.filename,f.scope));
    assert.equal(next.teacher.phase,'night_burrow');assert.equal(next.teacher.wilderness.burrow.stage,stage);
    assert.equal(next.store.snapshot().construction.burrow.stage,stage);
    assert.ok(!next.store.snapshot().events.some(e=>e.kind==='remote_burrow_operation_discarded'));
    assert.equal(next.verifiedBurrow(),false,'restored intent cannot bypass live shell and footing checks');
    assert.equal(next.rememberShelter(),false);assert.equal(next.store.snapshot().metrics.recoveries,0);
    shellValid=true;f.b.entity.onGround=false;
    assert.equal(next.verifiedBurrow(),false,'even an intact local shell needs actual grounded footing');
    assert.equal(next.rememberShelter(),false);assert.equal(next.store.snapshot().metrics.recoveries,0);
  }
});

test('repeated death during resumed work preserves home and current interruption intent without reviving an old burrow',ctx=>{
  const f=fixture(ctx);f.engine.currentGoal='supplies';f.engine.teacher.phase='gather';
  f.engine.onDeath('first death');f.items={};f.b.entity.position=new Vec3(24.5,64,24.5);
  f.engine.onRespawn(f.b.entity.position,[]);
  f.engine.currentGoal='recover';f.engine.teacher.phase='night_burrow';
  f.engine.teacher.wilderness.burrow={feet:[24,64,24],cap:[24,64,24],lip:[25,64,24],stage:'seal',resume:'gather'};
  f.engine.onDeath('second interrupted cover');f.b.entity.position=new Vec3(-16,69,-48);
  f.engine.onRespawn(f.b.entity.position,[]);
  assert.ok(!f.engine.teacher.wilderness.burrow);assert.equal(f.engine.teacher.phase,'gather');
  assert.deepEqual(f.engine.teacher.plot,f.plot);assert.equal(f.engine.recovering,true);
  assert.deepEqual(f.engine.status().inventory,[]);assert.equal(f.engine.bedProof,null);
  const saved=f.store.snapshot();assert.equal(saved.metrics.deaths,2);assert.equal(saved.metrics.respawns,2);
  assert.equal(saved.metrics.recoveries,0);assert.equal(saved.resume[0].goal,'recover');
  assert.equal(saved.resume[0].phase,'night_burrow');
  assert.equal(saved.construction.burrow,null);
  assert.equal(saved.events.filter(e=>e.kind==='remote_burrow_operation_discarded').length,1);
});

test('disconnect after respawn preserves required recovery until physical success and completion survives another restart',ctx=>{
  const f=fixture(ctx);f.engine.onDeath('interrupted task');f.items={};
  f.advance(1200);
  f.b.entity.position=new Vec3(24.5,64,24.5);f.engine.onRespawn(f.b.entity.position,[]);
  assert.equal(f.store.snapshot().recovery.required,true);
  f.engine.onDisconnect('disconnect before checked home return');
  f.advance(2300);
  const nextStore=open(f.filename,f.scope),next=f.make(nextStore);
  assert.equal(next.recovering,true);next.onRespawn(f.b.entity.position,[]);
  assert.equal(nextStore.snapshot().recovery.respawn.fromDeath,false,'reconnect is not another native death');
  assert.equal(nextStore.snapshot().metrics.respawns,1);
  assert.equal(next.recovering,true);assert.equal(nextStore.snapshot().recovery.required,true);
  assert.equal(next.completeRecovery('returned_to_owned_home',{claimed:true}),false);
  assert.equal(nextStore.snapshot().recovery.required,true);
  f.b.entity.position=new Vec3(.5,64,.5);
  assert.equal(next.completeRecovery('returned_to_owned_home',{shelterUsable:true}),true);
  assert.equal(nextStore.snapshot().recovery.lastOutcome.durationMs,3500,'recovery duration includes respawn and reconnect downtime');
  assert.equal(nextStore.snapshot().recovery.required,false);next.onDisconnect('restart after physical success');
  const finalStore=open(f.filename,f.scope),final=f.make(finalStore);
  assert.equal(final.recovering,false);final.onRespawn(f.b.entity.position,[]);
  assert.equal(final.recovering,false);assert.equal(finalStore.snapshot().recovery.required,false);
  assert.equal(finalStore.snapshot().metrics.recoveries,1);
});

test('forensic fromDeath evidence cannot restart an already completed recovery on reload',ctx=>{
  const f=fixture(ctx);f.engine.onDeath();f.items={};f.engine.onRespawn(f.b.entity.position,[]);
  assert.equal(f.store.snapshot().recovery.respawn.fromDeath,true);
  assert.equal(f.engine.completeRecovery('returned_to_owned_home',{shelterUsable:true}),true);
  f.engine.onDisconnect('restart after direct recovery');
  const next=f.make(open(f.filename,f.scope));assert.equal(next.recovering,false);
});

test('old awaited actions and model proposals cannot mutate a newer life',async ctx=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture(ctx,{api:async()=>pending});
  const proposal=f.engine.api('/step',{teacher:0});
  const scoped=f.engine.scopedBot(f.engine.generation);
  f.engine.onDeath('during proposal');release({action:0});
  await assert.rejects(proposal,{code:'PILOT_LIFE_CHANGED'});
  assert.throws(()=>scoped.craft(),{code:'PILOT_LIFE_CHANGED'});
  assert.equal(f.store.snapshot().metrics.deaths,1);assert.equal(f.engine.bedProof,null);
});

test('native asynchronous completion after death is cancelled before subsequent work',async ctx=>{
  const f=fixture(ctx);let finish;
  f.b.craft=()=>new Promise(resolve=>{finish=resolve;});
  const old=f.engine.scopedBot(f.engine.generation),craft=old.craft();
  f.engine.onDeath();f.items={};f.engine.onRespawn(f.b.entity.position,[]);finish();
  await assert.rejects(craft,{code:'PILOT_LIFE_CHANGED'});
  assert.deepEqual(f.store.snapshot().recovery.respawn.inventory,[]);
});

test('trial setup, synthetic resources and unverified bed registration are refused',async ctx=>{
  const f=fixture(ctx,{api:async()=>({verified:false})});
  for(const route of ['/world/spawn','/world/camp','/world/resources','/world/quarry'])
    await assert.rejects(f.engine.api(route,{}),/refused trial setup/);
  await assert.rejects(f.engine.api('/world/survival',{action:'stations'}),/synthetic/);
  await assert.rejects(f.engine.api('/world/survival',{action:'home'}),/not verified/);
  assert.equal(f.engine.bedProof,null);
});

test('a loaded but damaged remembered home never earns a recovery success',ctx=>{
  const f=fixture(ctx);f.engine.onDeath();f.engine.onRespawn(f.b.entity.position,[]);
  f.set(new Vec3(0,67,0),'air');
  assert.equal(f.engine.completeRecovery('returned_to_owned_home',{shelterUsable:true}),false);
  assert.equal(f.engine.completeRecovery('temporary_shelter_verified',{claimed:true}),false);
  assert.equal(f.store.snapshot().metrics.recoveries,0);assert.equal(f.engine.recovering,true);
  f.set(new Vec3(0,67,0),'oak_planks');
  assert.equal(f.engine.completeRecovery('returned_to_owned_home',{shelterUsable:true}),true);
  assert.equal(f.store.snapshot().metrics.recoveries,1);assert.equal(f.engine.recovering,false);
});

test('repeated stalls back off goals without ending a continuing life or erasing its home',ctx=>{
  const f=fixture(ctx);
  f.engine.teacher.homeRepair={stage:'wool',resume:'night_food'};
  for(let i=0;i<4;i++){f.engine.defer('food','No safe reachable livestock');f.advance(10001);}
  assert.equal(f.engine.backoff.food.attempts,4);assert.ok(f.engine.backoff.food.until>f.now+100000);
  assert.equal(f.engine.dead,false);assert.equal(f.engine.teacher.phase,'gather');
  assert.deepEqual(f.engine.teacher.plot,f.plot);assert.equal(f.store.snapshot().metrics.repeatedStalls,4);
  assert.notEqual(f.engine.status().state,'stopped');
  assert.equal(f.engine.teacher.homeRepair,null,'a deferred repair cannot keep taking over alternate goals');
});

test('walking repeatedly between the same two cells cannot reset the no-progress timer forever',ctx=>{
  const f=fixture(ctx);f.engine.homeView=physicalHome(f.b,f.plot,[]);
  f.engine.progress();f.advance(1000);f.b.entity.position.x=1.5;f.engine.progress();
  const at=f.engine.progressAt;
  for(let i=0;i<5;i++){f.advance(20000);f.b.entity.position.x=i%2?.5:1.5;f.engine.progress();}
  assert.equal(f.engine.progressAt,at);assert.ok(f.now-at>=100000);
});

test('a real missing roof is repaired incrementally with consumed mock materials and original intent retained',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.set(new Vec3(0,67,0),'air');
  const before=f.items.oak_planks;
  f.engine.teacher.walk=async(_b,_m,g)=>{f.b.entity.position=new Vec3(g[0],Math.round(g[1]),g[2]);return true;};
  f.engine.teacher.place=async(_b,q,name)=>{assert.equal(name,'oak_planks');assert.ok(f.items[name]>0);f.items[name]--;f.set(new Vec3(q.x,q.y,q.z),name);};
  for(let i=0;i<15&&f.b.blockAt(new Vec3(0,67,0)).name==='air';i++){await f.engine.tick();f.advance(2000);}
  assert.equal(f.b.blockAt(new Vec3(0,67,0)).name,'oak_planks');assert.equal(f.items.oak_planks,before-1);
  assert.equal(f.engine.dead,false);assert.deepEqual(f.engine.teacher.plot,f.plot);
  assert.ok(f.engine.homeView.usable);assert.equal(f.engine.established,true);
});

test('a stale mine resumes only by exiting through rechecked stairs and never recreates carried tools',ctx=>{
  const f=fixture(ctx),mine={run:f.engine.run,owner:f.b.username,entry:[0,64,0],path:[[0,64,0],[1,63,0],[2,62,0]],
    stage:'dig',next:{invented:true},resource:'stone',steps:2};
  f.b.entity.position=new Vec3(2.5,62,.5);f.items={};
  const saved=f.store.snapshot();saved.construction.mine=trackedMine(mine);
  const teacher=freshTeacher(f.b,f.engine.frame,saved);
  assert.equal(teacher.wilderness.mine.stage,'exit');assert.equal(teacher.wilderness.mine.next,null);
  assert.equal(teacher.wilderness.mine.owner,f.b.username);assert.equal(teacher.phase,'night_stone');
  assert.deepEqual(f.b.inventory.items(),[]);
  f.b.entity.position=new Vec3(25.5,64,25.5);
  assert.equal(freshTeacher(f.b,f.engine.frame,saved).wilderness.mine,undefined);
});

test('a physically present bed requires native server proof and the custom world key stays unchanged',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.b.entity.position=house.point(f.plot,'bed').offset(.5,0,.5);
  f.engine.homeView=physicalHome(f.b,f.plot,['bed_home']);
  await f.engine.registerBed();
  assert.equal(f.engine.bedProof.verified,true);assert.equal(f.b.game.dimension,'minecraft:lab_persistent_pilot');
  assert.ok(f.engine.teacher.milestones.includes('bed_home'));
});

test('a usable axe completes early harvesting capability without returning to an unfinished home table',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.established=false;
  f.set(house.point(f.plot,'table'),'air');
  f.engine.teacher.phase='night_bootstrap';let worked=0;
  f.engine.teacher.tick=async()=>{
    worked++;assert.equal(f.engine.teacher.phase,'gather');
    assert.equal(f.engine.teacher.wilderness.bootstrap,true);
  };
  await f.engine.tick();assert.equal(worked,1);
  assert.equal(f.engine.homeView.table,false);
  assert.deepEqual(f.engine.teacher.plot,f.plot);
});

test('deferred local axe preparation continues real hand harvesting without the legacy home trip',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.established=false;f.items={oak_log:4};
  f.engine.teacher.phase='night_bootstrap';
  ctx.mock.method(require('../pilot/local_bootstrap.cjs'),'tick',async()=>false);
  let worked=0;f.engine.teacher.tick=async()=>{
    worked++;assert.equal(f.engine.teacher.phase,'gather');
    assert.equal(f.engine.teacher.wilderness.bootstrap,true,'local pipeline owns the legacy four-log handoff');
    assert.equal(f.b.inventory.items().some(i=>i.name==='wooden_axe'),false,'no tool is invented');
  };
  await f.engine.tick();assert.equal(worked,1);
  assert.equal(f.engine.teacher.wilderness.bootstrap,false,'capability flag is restored after ordinary work');
});

test('local workbench intent survives reload as a claim without changing home or carried inventory',ctx=>{
  const f=fixture(ctx);f.items={oak_log:1};
  f.engine.teacher.wilderness.pilotWorkbench={owner:f.b.username,run:f.engine.run,position:[12,64,12],
    actions:3,startedAt:f.now,retryAt:f.now+60000,outputs:['oak_planks'],placed:true};
  f.engine.save(true);const next=f.make(open(f.filename,f.scope));
  assert.deepEqual(next.teacher.wilderness.pilotWorkbench,{...f.engine.teacher.wilderness.pilotWorkbench,verified:false,verifiedAt:null});
  assert.deepEqual(next.teacher.plot,f.plot);assert.deepEqual(next.status().inventory,[{name:'oak_log',count:1,slot:9}]);
  assert.equal(next.bedProof,null);assert.equal(next.store.snapshot().metrics.completedGoals,0);
});

test('a night watch persists unfinished work and resumes it after daylight and a controller reload',async ctx=>{
  quiet(ctx);let night=true;ctx.mock.method(shelter,'danger',()=>night);
  const f=fixture(ctx);f.engine.established=false;f.engine.teacher.phase='night_wool';
  f.set(house.point(f.plot,'bed'),'air');f.set(house.point(f.plot,'bed').offset(0,0,1),'air');
  await f.engine.tick();assert.equal(f.engine.teacher.phase,'night_hold');
  assert.equal(f.store.snapshot().construction.workPhase,'night_wool');
  assert.equal(f.engine.lastMode,'shelter_watch');
  f.engine.onDisconnect('restart during watch');night=false;
  const next=f.make(open(f.filename,f.scope));let resumed=false;
  next.teacher.tick=async()=>{assert.equal(next.teacher.phase,'night_wool');resumed=true;};
  await next.tick();assert.equal(resumed,true);assert.equal(next.dead,false);
});

test('actual stored tools can restore post-death capability and a stale storage claim cannot supply anything',async ctx=>{
  const f=fixture(ctx);f.items={};f.engine.homeView=physicalHome(f.b,f.plot,['chest']);
  ctx.mock.method(require('../controller/inventory_sync'),'sync',async()=>{});
  const slots=[{name:'wooden_axe',type:7,count:1,metadata:0}],window={inventoryStart:27,slots:[...slots,...Array(26).fill(null)]};
  let withdrawn=0;window.withdraw=async(type,metadata,amount)=>{
    assert.equal(type,7);assert.equal(amount,1);withdrawn++;f.items.wooden_axe=1;window.slots[0]=null;
  };
  f.b.openContainer=async()=>{f.b.currentWindow=window;return window;};
  f.b.closeWindow=async()=>{f.b.currentWindow=null;};
  f.engine.activeBot=f.engine.scopedBot(f.engine.generation);
  assert.equal(await f.engine.inspectStorage(),true);
  assert.equal(withdrawn,1);assert.equal(f.b.inventory.items()[0].name,'wooden_axe');
  assert.deepEqual(f.store.snapshot().storage[0].observedContents,[]);
  f.items={};f.advance(11000);
  f.store.update({storage:[{id:'home_chest',position:house.point(f.plot,'chest').toArray(),observedContents:[{name:'wooden_axe',count:99}]}]});
  assert.equal(await f.engine.inspectStorage(),false);
  assert.equal(withdrawn,1);assert.deepEqual(f.b.inventory.items(),[]);
});

test('old native chest transfers cannot resume after a newer life is spawned',async ctx=>{
  const f=fixture(ctx);let transferred=0;
  f.b.openContainer=async()=>({withdraw:async()=>{transferred++;}});
  const old=f.engine.scopedBot(f.engine.generation),window=await old.openContainer();
  f.engine.onDeath();f.engine.onRespawn(f.b.entity.position,[]);
  assert.throws(()=>window.withdraw(),{code:'PILOT_LIFE_CHANGED'});
  assert.equal(transferred,0);
});

test('failure to find a safe loaded plot surveys checked terrain at a bounded rate without a setup command',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.teacher.plot=null;f.engine.teacher.campPlots=[];
  const nav=require('../controller/field_navigation');ctx.mock.method(nav,'route',()=>({reached:false}));
  let scans=0;f.engine.teacher.wilderness.exploration.choose=async()=>{scans++;return null;};
  await f.engine.tick();assert.equal(scans,1);assert.equal(f.engine.teacher.plot,null);
  f.advance(100);await f.engine.tick();assert.equal(scans,1);
  f.advance(10000);await f.engine.tick();assert.equal(scans,2);
  assert.equal(f.engine.dead,false);assert.notEqual(f.engine.teacher.phase,'stopped');
  assert.match(f.engine.message,/bounded terrain recheck/);
  assert.equal(f.store.snapshot().metrics.recoveries,0);
});

test('a remembered sealed burrow elsewhere cannot count as physical post-respawn shelter',ctx=>{
  const f=fixture(ctx);f.engine.teacher.wilderness.burrow={stage:'hidden',feet:[20,64,20],cap:[20,64,20],lip:[21,64,20]};
  ctx.mock.method(require('../controller/emergency_burrow'),'sealed',()=>true);
  ctx.mock.method(require('../controller/emergency_burrow'),'walls',()=>true);
  f.engine.recovering=true;
  assert.equal(f.engine.rememberShelter(),false);assert.equal(f.store.snapshot().metrics.recoveries,0);
  f.b.entity.position=new Vec3(20.5,62,20.5);
  assert.equal(f.engine.rememberShelter(),true);assert.equal(f.store.snapshot().metrics.recoveries,1);
});

test('a refused maintenance return defers for at least sixty seconds without mining an unowned obstruction',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.b.entity.position=new Vec3(-8.5,64,-8.5);
  const obstruction=new Vec3(0,64,-4);f.set(obstruction,'cobblestone');f.set(obstruction.offset(0,1,0),'cobblestone');
  f.engine.currentGoal='maintenance';f.engine.homeView=physicalHome(f.b,f.plot,[]);
  let attempts=0,covers=0;f.engine.teacher.walk=async()=>{attempts++;return false;};
  f.engine.temporaryCover=async()=>{covers++;};
  await f.engine.watch();
  assert.equal(attempts,1);assert.equal(covers,1);assert.equal(f.engine.currentGoal,'temporary_cover');
  assert.ok(f.engine.backoff.return_home.until>=f.now+60000);assert.equal(f.engine.homeReturn.verified,false);
  assert.equal(f.b.blockAt(obstruction).name,'cobblestone');assert.equal(f.store.snapshot().metrics.recoveries,0);
  assert.equal(chooseGoal({...basic,insideHome:false,backoff:f.engine.backoff,now:f.now}).kind,'temporary_cover');
  f.engine.save(true);const next=f.make(open(f.filename,f.scope));
  assert.equal(next.backoff.return_home.until,f.engine.backoff.return_home.until);
});

test('an unresolved maintenance walk is bounded even if it keeps returning no terminal route decision',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.b.entity.position=new Vec3(-8.5,64,-8.5);
  f.engine.homeView=physicalHome(f.b,f.plot,[]);f.engine.currentGoal='maintenance';
  f.engine.teacher.walk=async()=>undefined;let covers=0;f.engine.temporaryCover=async()=>{covers++;};
  await f.engine.watch();assert.equal(covers,0);f.advance(30001);await f.engine.watch();
  assert.equal(covers,1);assert.ok(f.engine.backoff.return_home.until>f.now);
});

test('a blocked return credits only physically sealed temporary cover, then rechecks a changed route after backoff',async ctx=>{
  quiet(ctx);const f=fixture(ctx),burrow=require('../controller/emergency_burrow'),feet=new Vec3(20,64,20);
  const obstruction=new Vec3(0,64,-4);f.set(obstruction,'cobblestone');f.set(obstruction.offset(0,1,0),'cobblestone');
  f.b.entity.position=new Vec3(-8.5,64,-8.5);f.engine.currentGoal='maintenance';
  f.engine.homeView=physicalHome(f.b,f.plot,[]);f.engine.teacher.walk=async()=>false;
  ctx.mock.method(burrow,'find',()=>feet);let coverSteps=0;
  ctx.mock.method(burrow,'tick',async t=>{
    coverSteps++;const s=t.wilderness.burrow;s.stage='hidden';s.cap_name='dirt';s.lip_name='dirt';s.shellVerified=true;
    f.set(feet,'dirt');f.set(new Vec3(...s.lip),'dirt');f.set(feet.offset(0,-1,0),'air');f.set(feet.offset(0,-2,0),'air');
    f.b.entity.position=feet.offset(.5,-2,.5);return true;
  });
  await f.engine.watch();assert.equal(f.engine.verifiedBurrow(),true);
  assert.equal(f.store.snapshot().recovery.temporaryShelter.verified,true);
  assert.equal(f.store.snapshot().metrics.recoveries,0,'ordinary access fallback is not a new death recovery');
  assert.equal(f.b.blockAt(obstruction).name,'cobblestone');
  await f.engine.tick();assert.equal(coverSteps,1);assert.equal(f.engine.lastMode,'shelter_watch');
  assert.match(f.engine.message,/home access recheck/);
  // Simulate the shared helper completing its checked exit after the hold,
  // and a human/world change removing the obstruction. The pilot never digs it.
  f.advance(60001);f.engine.teacher.wilderness.burrow=null;f.engine.teacher.phase='gather';
  f.b.entity.position=new Vec3(-8.5,64,-8.5);f.set(obstruction,'air');f.set(obstruction.offset(0,1,0),'air');
  f.items={oak_planks:16,wooden_axe:1,wooden_pickaxe:1,cooked_beef:8};
  let rechecks=0;f.engine.teacher.walk=async()=>{rechecks++;f.b.entity.position=new Vec3(.5,64,.5);return true;};
  f.engine.inspectStorage=async()=>false;await f.engine.watch();await f.engine.watch();
  assert.equal(rechecks,1);assert.equal(f.engine.homeReturn.verified,true);assert.equal(f.engine.backoff.return_home,undefined);
});

test('white-wool recovery defers after 180 active seconds despite movement and unrelated inventory changes',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.set(house.point(f.plot,'bed'),'air');f.set(house.point(f.plot,'bed').offset(0,0,1),'air');
  f.engine.homeView=physicalHome(f.b,f.plot,['bed_home']);f.engine.currentGoal='repair_home';
  f.engine.teacher.homeRepair={stage:'wool',resume:'night_food'};f.engine.teacher.phase='night_wool';
  for(let i=0;i<18;i++){
    f.advance(10000);f.b.entity.position.x=i+.5;f.items.dirt=i+1;f.engine.progress();
    assert.equal(f.engine.woolRecoveryBudget(10000),i===17);
  }
  assert.equal(f.engine.woolBudget.activeMs,180000);assert.match(f.engine.backoff.repair_home.reason,/white-wool/);
  assert.equal(f.engine.teacher.homeRepair,null);assert.equal(f.engine.teacher.phase,'gather');
  f.engine.save(true);assert.equal(f.store.snapshot().construction.woolBudget.activeMs,180000);
  f.b.entity.position=new Vec3(.5,64,.5);let maintained=false;
  f.engine.inspectStorage=async()=>{maintained=true;return false;};
  f.items.oak_planks=16;await f.engine.tick();assert.equal(f.engine.woolBudget.needsUsefulFallback,false);
  await f.engine.tick();assert.equal(f.engine.currentGoal,'maintenance');assert.equal(maintained,true);
  assert.equal(f.b.blockAt(house.point(f.plot,'bed')).name,'air');
});

test('wool acquisition budgets pause for native safety owners without cancelling or resetting their state',ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.currentGoal='repair_home';
  f.engine.teacher.homeRepair={stage:'wool'};f.engine.teacher.phase='night_wool';
  f.engine.homeView={bed:false};const t=f.engine.teacher,n=t.wilderness;
  const cases=[
    ()=>{n.mine={stage:'approach'};return ()=>{delete n.mine;};},
    ()=>{n.mine={stage:'exit'};return ()=>{delete n.mine;};},
    ()=>{n.burrow={stage:'climb'};return ()=>{delete n.burrow;};},
    ()=>{t.airEscape={path:[[0,65,0]]};return ()=>{delete t.airEscape;};},
    ()=>{t.waterWork={goal:[0,65,0]};return ()=>{delete t.waterWork;};},
    ()=>{t.waterTravel={goal:[0,65,0]};return ()=>{delete t.waterTravel;};},
    ()=>{n.forageResume='night_wool';return ()=>{delete n.forageResume;};},
    ()=>{f.b.entity.onGround=false;return ()=>{f.b.entity.onGround=true;};},
    ()=>{f.b.entity.isInWater=true;return ()=>{f.b.entity.isInWater=false;};},
    ()=>{t.phase='night_retreat';return ()=>{t.phase='night_wool';};}
  ];
  for(const setup of cases){const reset=setup();assert.equal(f.engine.woolRecoveryBudget(10000),false);
    assert.equal(f.engine.woolBudget.activeMs,0);assert.equal(f.engine.woolBudget.paused,true);reset();}
  assert.equal(t.homeRepair.stage,'wool');assert.equal(f.engine.backoff.repair_home,undefined);
  assert.equal(f.engine.woolRecoveryBudget(10000),false);assert.equal(f.engine.woolBudget.activeMs,10000);
});

test('only real wool or native bed proof renews the acquisition budget and its active time survives reconnect',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.currentGoal='repair_home';f.engine.homeView={bed:false};
  f.engine.teacher.homeRepair={stage:'wool'};f.engine.teacher.phase='night_wool';
  f.engine.woolRecoveryBudget(10000);f.advance(10000);f.engine.woolRecoveryBudget(10000);
  assert.equal(f.engine.woolBudget.activeMs,20000);f.items.white_wool=1;
  f.engine.woolRecoveryBudget(10000);assert.equal(f.engine.woolBudget.activeMs,0);
  for(let i=0;i<8;i++){f.advance(10000);f.engine.woolRecoveryBudget(10000);}
  f.engine.onDisconnect('while searching wool');const next=f.make(open(f.filename,f.scope));
  next.onRespawn(f.b.entity.position,f.b.inventory.items());next.homeView={bed:false};next.currentGoal='repair_home';
  assert.equal(next.woolBudget.activeMs,80000);next.woolRecoveryBudget(10000);assert.equal(next.woolBudget.activeMs,90000);
  next.operationGeneration=next.generation;
  await next.api('/world/survival',{action:'home',position:house.point(f.plot,'bed').toArray()});
  assert.equal(next.woolBudget.activeMs,0);assert.equal(next.woolBudget.completedAt,f.now);
});

test('unavailable wool at a distant frontier requires physical cover before another food or repair search',async ctx=>{
  quiet(ctx);const f=fixture(ctx),burrow=require('../controller/emergency_burrow');
  f.set(house.point(f.plot,'bed'),'air');f.set(house.point(f.plot,'bed').offset(0,0,1),'air');
  f.b.entity.position=new Vec3(50.5,64,-29.5);f.items.cooked_beef=3;
  const original=f.b.blockAt;f.b.blockAt=p=>Math.hypot(p.x-f.b.entity.position.x,p.z-f.b.entity.position.z)>32?null:original(p);
  f.engine.currentGoal='repair_home';f.engine.teacher.phase='night_wool';f.engine.teacher.homeRepair={stage:'wool'};
  f.engine.homeView=physicalHome(f.b,f.plot,['bed_home']);
  for(let i=0;i<18;i++)f.engine.woolRecoveryBudget(10000);
  assert.equal(f.engine.woolBudget.needsUsefulFallback,true);
  assert.ok(f.engine.backoff.repair_home.until>=f.now+60000);
  assert.equal(f.engine.homeView.loaded,false);assert.equal(f.engine.homeView.missing.length,0);
  const feet=new Vec3(50,64,-30);ctx.mock.method(burrow,'find',()=>feet);
  ctx.mock.method(burrow,'tick',async t=>{
    const s=t.wilderness.burrow;s.stage='hidden';s.cap_name='dirt';s.lip_name='dirt';s.shellVerified=true;
    f.set(feet,'dirt');f.set(new Vec3(...s.lip),'dirt');f.set(feet.offset(0,-1,0),'air');f.set(feet.offset(0,-2,0),'air');
    f.b.entity.position=feet.offset(.5,-2,.5);return true;
  });
  f.engine.teacher.tick=async()=>assert.fail('ordinary resource search must wait for a useful physical fallback');
  f.engine.teacher.walk=async()=>assert.fail('an unloaded home two search regions away is not a verified practical return');
  await f.engine.tick();
  assert.equal(f.engine.verifiedBurrow(),true);assert.equal(f.engine.woolBudget.needsUsefulFallback,false);
  const saved=f.store.snapshot();assert.equal(saved.recovery.temporaryShelter.verified,true);
  assert.equal(saved.construction.woolBudget.fallback.kind,'temporary_shelter');assert.equal(saved.metrics.resourceFallbacks,1);
  assert.equal(saved.metrics.recoveries,0);assert.deepEqual(saved.ownership.plot,f.plot);
  await f.engine.tick();assert.equal(f.engine.lastMode,'shelter_watch');assert.match(f.engine.message,/resource retry/);
});

test('missing-resource recovery intent survives restart and cannot clear on an unverified fallback claim',ctx=>{
  const f=fixture(ctx);f.engine.woolBudget={activeMs:180000,lastWool:0,lastBedProof:null,needsUsefulFallback:true};
  f.engine.currentGoal='repair_home';f.engine.defer('repair_home','No white-wool acquisition during 180 active seconds');
  f.b.entity.position=new Vec3(50.5,64,-29.5);f.engine.onDisconnect('before fallback');
  const next=f.make(open(f.filename,f.scope));assert.equal(next.woolBudget.needsUsefulFallback,true);
  assert.equal(next.completeResourceFallback('home'),false);assert.equal(next.completeResourceFallback('temporary_shelter'),false);
  assert.equal(next.woolBudget.needsUsefulFallback,true);assert.equal(next.store.snapshot().metrics.resourceFallbacks,undefined);
  assert.equal(chooseGoal({...basic,needsUsefulFallback:true,meals:0,backoff:next.backoff,now:f.now}).kind,'resource_recovery');
  assert.notEqual(chooseGoal({...basic,home:{loaded:false,usable:false,missing:[],bed:false}}).kind,'repair_home');
});

test('resource fallback exits an active mine and yields to shared water recovery before cover planning',async ctx=>{
  const f=fixture(ctx);f.engine.woolBudget={needsUsefulFallback:true};f.engine.homeView={loaded:false};
  const mine=f.engine.teacher.wilderness.mine={stage:'dig',path:[[1,64,1],[2,63,1]],entry:[1,64,1]};
  let exits=0,shore=0,covers=0;
  ctx.mock.method(require('../controller/staircase_mining'),'tick',async t=>{exits++;assert.equal(t.wilderness.mine.stage,'exit');});
  ctx.mock.method(require('../controller/water_work'),'tick',async()=>{shore++;return true;});
  f.engine.temporaryCover=async()=>{covers++;};
  await f.engine.resourceRecovery(f.engine.generation);assert.equal(exits,1);assert.equal(shore,0);assert.equal(covers,0);
  mine.stage='done';await f.engine.resourceRecovery(f.engine.generation);assert.equal(shore,1);assert.equal(covers,0);
  assert.equal(f.engine.woolBudget.needsUsefulFallback,true);
});

test('reload during prebuild mining retains its construction intent and a real ten-torch kit resumes build',async ctx=>{
  const f=fixture(ctx),lighting=require('../controller/early_lighting');
  for(const side of ['indoor','outdoor'])f.set(house.torchMount(f.plot,side).position,'air');
  f.store.update({construction:{phase:'night_stone',established:false,
    planner:{prebuildLighting:true,earlyLighting:true,lightingPrepared:true}}});
  const resumed=freshTeacher(f.b,f.engine.frame,open(f.filename,f.scope).snapshot());
  assert.equal(resumed.phase,'night_stone');assert.equal(resumed.wilderness.prebuildLighting,true);
  assert.equal(resumed.wilderness.lightingKitReady,false);
  // Native mining/crafting is tested separately. This regression represents
  // the actual inventory after that work rather than awarding remembered kit.
  f.items.torch=10;resumed.phase='torch_craft';
  assert.equal(await lighting.tick(resumed,f.b,f.motor,f.engine.frame),true);
  assert.equal(resumed.phase,'build');assert.equal(resumed.wilderness.prebuildLighting,false);
  assert.equal(resumed.wilderness.lightingKitReady,true);
});

test('post-kit build reconstructs readiness from physical torches and rejects a merely remembered flag',async ctx=>{
  const f=fixture(ctx),lighting=require('../controller/early_lighting');
  for(const side of ['indoor','outdoor'])f.set(house.torchMount(f.plot,side).position,'air');
  // No indoor support yet, so this tick tests preparation selection rather
  // than trying to place a torch with a mock native placement API.
  f.set(house.torchMount(f.plot,'indoor').support,'air');
  f.store.update({construction:{phase:'build',established:false,planner:{prebuildLighting:false,lightingKitReady:true}}});
  const saved=open(f.filename,f.scope).snapshot();f.items.torch=10;
  const resumed=freshTeacher(f.b,f.engine.frame,saved);
  assert.equal(resumed.wilderness.lightingKitReady,true);
  assert.equal(await lighting.tick(resumed,f.b,f.motor,f.engine.frame),false);assert.equal(resumed.phase,'build');
  f.items.torch=9;const insufficient=freshTeacher(f.b,f.engine.frame,saved);
  assert.equal(insufficient.wilderness.lightingKitReady,false);
  assert.equal(await lighting.tick(insufficient,f.b,f.motor,f.engine.frame),true);
  assert.equal(insufficient.phase,'night_light_tools','the shared ten-torch preparation threshold remains intact');
  delete f.items.torch;
  f.set(house.torchMount(f.plot,'indoor').support,'oak_planks');
  for(const side of ['indoor','outdoor']){const mount=house.torchMount(f.plot,side);f.set(mount.position,'wall_torch',{facing:mount.facing});}
  assert.equal(freshTeacher(f.b,f.engine.frame,saved).wilderness.lightingKitReady,true);
});

test('diagnosed wool repair remains active with an unloaded home and three meals until its finite budget expires',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.set(house.point(f.plot,'bed'),'air');f.set(house.point(f.plot,'bed').offset(0,0,1),'air');
  f.items.cooked_beef=3;f.engine.currentGoal='repair_home';f.engine.teacher.phase='night_wool';
  f.engine.teacher.homeRepair={stage:'wool',resume:'night_food'};
  f.engine.homeView=physicalHome(f.b,f.plot,['bed_home']);f.engine.woolRecoveryBudget(0);
  assert.equal(f.engine.woolBudget.pending,true);
  f.b.entity.position=new Vec3(50.5,64,-29.5);
  const original=f.b.blockAt;f.b.blockAt=p=>Math.hypot(p.x-f.b.entity.position.x,p.z-f.b.entity.position.z)>32?null:original(p);
  let woolSteps=0;f.engine.teacher.tick=async()=>{woolSteps++;assert.equal(f.engine.teacher.phase,'night_wool');};
  for(let i=0;i<17;i++){
    f.b.entity.position.x=40.5+i*.5;f.advance(10000);await f.engine.tick();assert.equal(f.engine.currentGoal,'repair_home');
    assert.equal(f.engine.homeView.loaded,false);assert.equal(f.engine.woolBudget.needsUsefulFallback,undefined);
  }
  assert.equal(woolSteps,17);assert.equal(f.engine.woolBudget.activeMs,170000);
  f.advance(10000);await f.engine.tick();
  assert.equal(f.engine.woolBudget.activeMs,180000);assert.equal(f.engine.woolBudget.needsUsefulFallback,true);
  assert.match(f.engine.backoff.repair_home.reason,/white-wool/);assert.ok(f.engine.backoff.repair_home.until>=f.now+60000);
  assert.equal(woolSteps,17,'expiration defers before starting another food or wool search');
  assert.equal(chooseGoal({...basic,home:{loaded:false,usable:false,missing:[],bed:false},meals:3,
    pendingWoolRepair:true,needsUsefulFallback:true,now:f.now,backoff:f.engine.backoff}).kind,'resource_recovery');
  f.engine.onDisconnect('bounded wool intent');const next=f.make(open(f.filename,f.scope));
  assert.equal(next.woolBudget.pending,true);assert.equal(next.woolBudget.needsUsefulFallback,true);
});

test('immediate shared survival still preempts a retained wool task before its acquisition budget advances',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.engine.woolBudget={pending:true,activeMs:170000,lastWool:0,lastBedProof:null};
  f.engine.teacher.phase='night_wool';f.engine.currentGoal='repair_home';f.b.food=10;f.items.cooked_beef=3;
  let survival=0;ctx.mock.method(firstNight,'interrupt',async t=>{survival++;t.message='Eating carried food before continuing';return true;});
  f.engine.teacher.tick=async()=>assert.fail('ordinary wool work cannot precede the immediate survival action');
  f.advance(10000);await f.engine.tick();
  assert.equal(survival,1);assert.equal(f.engine.woolBudget.activeMs,170000);
  assert.equal(f.engine.backoff.repair_home,undefined);assert.match(f.engine.message,/Eating carried food/);
});

test('restart after physical bed placement verifies native respawn before completing pending wool repair',async ctx=>{
  quiet(ctx);const f=fixture(ctx);f.items.oak_planks=16;
  f.store.update({construction:{phase:'home_repair',woolBudget:{pending:true,activeMs:170000,lastWool:0,lastBedProof:null}}});
  const next=f.make(open(f.filename,f.scope));assert.equal(next.teacher.phase,'gather');
  assert.equal(next.bedProof,null);assert.equal(next.woolBudget.pending,true);
  next.teacher.tick=async()=>assert.fail('a physically placed replacement bed needs registration, not more resource acquisition');
  next.inspectStorage=async()=>false;
  await next.tick();assert.equal(next.currentGoal,'register_bed');assert.equal(next.bedProof.verified,true);
  assert.equal(next.woolBudget.pending,false);assert.equal(next.woolBudget.activeMs,0);
  assert.equal(next.store.snapshot().construction.woolBudget.pending,false);
  await next.tick();assert.equal(next.currentGoal,'maintenance');
  assert.notEqual(chooseGoal({...basic,pendingWoolRepair:true,bedVerified:false,
    backoff:{register_bed:{until:10000}},now:1000}).kind,'register_bed','native registration refusal backoff remains respected');
});

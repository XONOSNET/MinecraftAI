'use strict';

// Continuing-life orchestration. Native movement, crafting, excavation and
// placement remain in the existing controller; no production API is contacted.
const crypto = require('node:crypto');
const {Vec3} = require('vec3');
const {HutTeacher, findPlot, intact, secureInterior, surface} = require('../controller/hut_teacher');
const house = require('../controller/house');
const firstNight = require('../controller/first_night');
const homeRepair = require('../controller/home_repair');
const nav = require('../controller/field_navigation');
const inventory = require('../controller/inventory_sync');
const shelter = require('../controller/shelter_policy');
const burrow = require('../controller/emergency_burrow');
const burrowBootstrap = require('./burrow_bootstrap.cjs');
const {WorldStall} = require('../controller/world_stall');
const {WorldTiming} = require('../controller/world_timing');
const {WorldNavigation} = require('../controller/world_navigation');

const LOG = /^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
const CONSTRUCTION = new Set(['gather','craft','clear_plot','floor','table','door_craft','build','door','enter','shelter',
  'leave_hut','supply_craft','return_home','chest','tools','stock_chest','quarry_setup','quarry_exit','quarry',
  'fuel_log','stone_return','stone_tools','furnace','smelt','torch_craft','light_inside','light_exit','light_place','light_return']);
const SAFETY = new Set(['night_retreat','night_recover','night_seek_cover','night_burrow']);
const count = (b, predicate) => b.inventory.items().filter(i => typeof predicate === 'string' ? i.name === predicate : predicate(i.name))
  .reduce((n, i) => n + i.count, 0);
const actualItems = b => b.inventory.items().map(i => ({name:i.name, count:i.count, ...(Number.isInteger(i.slot)?{slot:i.slot}:{})}));
const point = p => Array.isArray(p) ? [...p] : [p.x,p.y,p.z];
const plain = value => JSON.parse(JSON.stringify(value));
const validPhase = p => typeof p === 'string' && (CONSTRUCTION.has(p) || /^night_[a-z_]+$/.test(p));
const wood = b => count(b, n => LOG.test(n))*4 + count(b, n => n.endsWith('_planks'));
const tool = (b, kind) => b.inventory.items().some(i => i.name.endsWith('_'+kind) &&
  (i.maxDurability == null || i.maxDurability-(i.durabilityUsed||0)>3));

function localBurrow(b, s) {
  if(!s||!['approach','dig','lip','seal','hidden','open','reclaim','climb'].includes(s.stage)||
    !['feet','cap','lip'].every(key=>Array.isArray(s[key])&&s[key].length===3&&s[key].every(Number.isFinite)))return false;
  const p=b.entity.position, [x,y,z]=s.feet;
  // This is an execution location, not a home waypoint. A respawn must not
  // resume sealing a shaft elsewhere. Local shells still pass every native
  // footing, wall, support, inventory and exit check before any action.
  return Math.hypot(p.x-x-.5,p.z-z-.5)<=(s.stage==='approach'?8:1.5)&&
    p.y>=y-3&&p.y<=y+(s.stage==='approach'?3:.5);
}

function physicalHome(b, plot, intended=[]) {
  if (!plot) return {known:false, loaded:false, usable:false, missing:[], matched:0, bed:false};
  const t = {plot, milestones:['hut',...intended], campPlots:[]};
  const targets = homeRepair.expected(t, b), missing=[], unknown=[];
  for (const target of targets) {
    const matches=homeRepair.matches(b,target);
    if (matches===null) unknown.push(target); else if (!matches) missing.push(target);
  }
  const at = (key,name) => b.blockAt(house.point(plot,key))?.name===name;
  const foot=b.blockAt(house.point(plot,'bed')), head=b.blockAt(house.point(plot,'bed').offset(0,0,1));
  const bed=!!foot?.name.endsWith('_bed') && head?.name===foot.name &&
    foot.getProperties?.().part==='foot' && head.getProperties?.().part==='head';
  const door=b.blockAt(new Vec3(plot.x,plot.y,plot.z-3));
  const upper=b.blockAt(new Vec3(plot.x,plot.y+1,plot.z-3));
  const doorway=!!door?.name.endsWith('_door') && upper?.name===door.name &&
    door.getProperties?.().half==='lower' && upper.getProperties?.().half==='upper';
  const shell=unknown.length===0 && intact(b,plot) && doorway;
  const unsafe=missing.some(q=>q.structural);
  return {known:true, loaded:unknown.length===0, usable:shell&&!unsafe, shell, doorway, doorClosed:doorway&&door.getProperties().open===false,
    missing, unknown, matched:targets.length-missing.length-unknown.length, bed,
    table:at('table','crafting_table'), chest:at('chest','chest'), furnace:at('furnace','furnace'),
    torch:require('../controller/house_lighting').missing(b,plot)===0,
    unsafe, checkedAt:Date.now()};
}

function chooseGoal(o) {
  const available = kind => !(o.backoff?.[kind]?.until>o.now);
  if (!o.alive) return {kind:'await_respawn',reason:'Waiting for an actual server respawn'};
  if (o.danger) return {kind:'survival',reason:'Immediate threat or unsafe exposure'};
  if (o.recovering) return {kind:'recover',reason:'Recover actual post-respawn capability and a safe position'};
  if (!o.hasPlot) return {kind:'establish_home',reason:'Find a checked natural house plot'};
  if(o.needsUsefulFallback)return {kind:'resource_recovery',reason:'Verify a home return or nearby cover before another resource search'};
  if(o.insideHome===false&&o.backoff?.return_home?.until>o.now)
    return {kind:'temporary_cover',reason:'Home access is deferred; verify temporary cover before another checked return'};
  if (o.night && o.home.usable) return {kind:'shelter_watch',reason:'Keep checked cover until a safe work period'};
  if (!o.established && available('establish_home')) return {kind:'establish_home',reason:'Complete the owned modest home'};
  if(o.pendingWoolRepair&&o.home.bed&&!o.bedVerified&&available('register_bed'))
    return {kind:'register_bed',reason:'The replacement bed exists; verify native respawn before completing its interrupted repair'};
  if(o.pendingWoolRepair&&available('repair_home'))return {kind:'repair_home',reason:'Continue the diagnosed wool repair within its acquisition budget'};
  if (!o.home.usable && o.home.loaded!==false && available('repair_home')) return {kind:'repair_home',reason:'Restore the missing shelter or access parts'};
  if (o.meals<4 && available('food')) return {kind:'food',reason:'Replenish four real meals'};
  if ((!o.axe||!o.pickaxe) && available('tools')) return {kind:'tools',reason:'Replace essential tools from real materials'};
  if (o.home.missing.length && available('repair_home')) return {kind:'repair_home',reason:'Repair only damaged owned components'};
  if (!o.bedVerified && o.home.bed && available('register_bed')) return {kind:'register_bed',reason:'Verify native bed respawn registration'};
  if (o.wood<16 && available('supplies')) return {kind:'supplies',reason:'Replenish a modest wood reserve'};
  if(!o.home.usable)return {kind:'temporary_cover',reason:'Unavailable home work is deferred; seek real temporary cover'};
  return {kind:'maintenance',reason:'Inspect and maintain verified home supplies'};
}

function freshTeacher(b, frame, saved={}, now=Date.now()) {
  const t=new HutTeacher(), p=b.entity.position;
  Object.assign(t,{run:frame.run,phase:validPhase(saved.construction?.phase)?saved.construction.phase:'gather',
    started:now,lastReport:0,travelled:0,last:p.clone(),path:[],lastPlan:0,lastProgress:now,anchor:p.clone(),
    runtime:require('../controller/tasks').createRuntime(),resourceAccess:{},buildAttempts:new Map(),ignoredTrees:new Map(),
    ignoredDrops:new Map(),treeRetry:0,focusBlock:null,harvested:0,error:null,spawned:true,grove:null,inventoryAt:0,
    plot:saved.ownership?.plot?plain(saved.ownership.plot):saved.home?.plot?plain(saved.home.plot):null,
    campPlots:[],table:null,built:0,secureAt:null,settle:0,resources:[],destination:null,tree:null,treeApproach:null,
    pickup:null,timing:new WorldTiming(now),milestones:[],supplyRun:false,collecting:false,scanCount:0,observedTrees:0,
    quarry:null,lastRecoveryReset:0,resourceAt:0,serviceRetryAt:0,navigator:new WorldNavigation(),
    stall:new WorldStall(90),pilotStall:false});
  if(t.plot) { t.table=house.point(t.plot,'table');t.campPlots=[t.plot]; }
  firstNight.init(t,{...frame.world,memory:saved.construction?.memory||{}});
  t.wilderness.lightingKitReady=count(b,'torch')>=10||!!t.plot&&require('../controller/house_lighting').missing(b,t.plot)===0;
  // Planner intent can survive a connection; physical capability cannot.
  for(const key of ['prebuildLighting','earlyLighting','lightingPrepared','resume','coverResume','forageResume','fuelTrip'])
    if(['string','boolean'].includes(typeof saved.construction?.planner?.[key]))t.wilderness[key]=saved.construction.planner[key];
  const original=t.stall.update.bind(t.stall);
  t.stall.update=(...args)=>{const result=original(...args);t.pilotStall=result.expired;return {...result,expired:false};};
  const oldBurrow=saved.construction?.burrow;
  if(localBurrow(b,oldBurrow)) {
    t.wilderness.burrow={...plain(oldBurrow),at:now,progressAt:now};
    t.phase='night_burrow';
  } else if(oldBurrow) {
    t.pilotDiscardedBurrow={stage:oldBurrow.stage,feet:oldBurrow.feet,
      reason:'Remembered burrow operation is not local to the actual player position'};
    t.phase='gather';
  }
  const oldMine=saved.construction?.mine;
  if(oldMine?.path?.length && oldMine.path.length<=80 && oldMine.owner===b.username && oldMine.run===frame.run) {
    const distance=Math.min(...oldMine.path.map(v=>p.distanceTo(new Vec3(...v))));
    if(distance<4 && p.y<oldMine.entry[1]-.5) {
      t.wilderness.mine={...plain(oldMine),stage:'exit',exitIndex:oldMine.path.length-1,next:null,recovery:'interrupted',
        reason:'Controller resumed: exit through rechecked stairs before more excavation'};
      t.phase='night_stone';
    }
  }
  return t;
}

function trackedMine(m) {
  if(!m?.path?.length)return null;
  const keys=['run','owner','entry','path','supports','flooded','dir','resource','target_y','steps','lit_at','torches','coal_mined','resume_count','reason'];
  return Object.fromEntries(keys.filter(k=>m[k]!==undefined).map(k=>[k,plain(m[k])]));
}
function trackedBurrow(s) {
  if(!s)return null;
  const keys=['feet','cap','lip','stage','resume','cap_name','lip_name','reason','shellRepairs','workspace','pilotBootstrap'];
  return Object.fromEntries(keys.filter(k=>s[k]!==undefined).map(k=>[k,plain(s[k])]));
}

class PilotLife {
  constructor(bot,motor,store,options={}) {
    this.bot=bot;this.motor=motor;this.store=store;this.clock=options.clock||Date.now;
    this.scan=options.scan||require('../controller/perception').scan;
    this.tasks=options.tasks||require('../controller/tasks');this.remote=options.api||(async(path,data)=>({action:data.teacher}));
    const saved=store.snapshot();
    this.run='pilot-'+crypto.createHash('sha256').update(saved.worldKey+'\0'+saved.identity).digest('hex').slice(0,24);
    const bounds=options.bounds||options.world?.bounds;
    if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(v=>!Number.isFinite(v)))throw Error('Persistent life requires checked world bounds');
    this.frame={run:this.run,mode:'teacher',world:{...options.world,bounds:[...bounds],index:0,count:1,driver:'teacher',prepared:false,
      mission:'first_night',time_budget_seconds:3600,first_night:{id:3,hostiles:true,trees:false,stations:false,prepared:false,watch_until_sunrise:true},
      lessons:[],memory:saved.construction?.memory||{}}};
    this.teacher=freshTeacher(bot,this.frame,saved);
    this.generation=0;this.operationGeneration=0;this.dead=!!saved.recovery.awaitingRespawn;
    this.recovering=!!saved.recovery.required||this.dead||(saved.recovery.required===undefined&&
      saved.recovery.phase==='recovering'&&saved.recovery.respawn?.fromDeath===true);
    this.established=!!saved.construction.established;this.backoff=plain(saved.construction.backoff||{});
    this.currentGoal=saved.goal?.kind||'establish_home';this.currentStatus='starting';this.message='Checking continuing-world claims';
    this.lastSave=0;this.lastSignature=null;this.progressAt=this.clock();this.lastAt=this.clock();this.lastMode='idle';
    this.lastRepair=0;this.bedProof=null;this.lastStorageAt=0;this.loot=null;this.recoveryStarted=this.clock();this.pendingMetrics={};
    this.recoveryOrigin=this.recovering?Math.min(this.clock(),saved.recovery.death?.at??this.clock()):this.clock();
    this.seenCells=new Set();this.ignoredLoot=new Set();this.lootBudgetAt=null;this.sessionMilestones=new Set();
    this.lastPlotSearch=-Infinity;this.plotSearches=0;
    this.resumePhase=saved.construction.workPhase||null;
    this.homeReturn=plain(saved.construction.homeReturn||{});
    this.woolBudget=saved.construction.woolBudget?plain(saved.construction.woolBudget):null;
    this.temporaryShelterProof=null;
    this.discardRemoteBurrow();
    this.api=async(path,data)=>{
      const generation=this.operationGeneration;
      if(generation!==this.generation||this.dead)throw Object.assign(Error('Life changed before native work'),{code:'PILOT_LIFE_CHANGED'});
      if(!['/step','/world/report','/world/survival'].includes(path))throw Error('Pilot refused trial setup endpoint '+path);
      if(path==='/world/survival'&&data.action!=='home')throw Error('Pilot refused synthetic survival resources');
      const result=await this.remote(path,path==='/world/report'?{...data,continuing_life:true}:data);
      if(generation!==this.generation||this.dead)throw Object.assign(Error('Life changed during native work'),{code:'PILOT_LIFE_CHANGED'});
      if(path==='/world/survival') {
        if(result?.verified!==true)throw Error('Native bed respawn registration was not verified');
        this.bedProof={...plain(result),at:this.clock()};
        if(this.woolBudget)Object.assign(this.woolBudget,{activeMs:0,lastBedProof:this.bedProof.at,
          lastWool:count(this.bot,'white_wool'),deferredAt:null,completedAt:this.clock(),pending:false});
      }
      return result;
    };
  }
  status() {
    return {run:this.run,goal:this.currentGoal,state:this.dead?'awaiting_respawn':this.currentStatus,phase:this.teacher.phase,
      message:this.message,home:this.teacher.plot,inventory:this.dead?[]:actualItems(this.bot),inventory_verified:!this.dead,recovering:this.recovering,
      activity:this.lastMode,home_verification:this.homeView?{loaded:this.homeView.loaded,usable:this.homeView.usable,
        missing:this.homeView.missing.map(q=>({x:q.x,y:q.y,z:q.z,kind:q.kind})),unknown_blocks:this.homeView.unknown?.length||0,bed:this.homeView.bed,
        bed_registered:!!this.bedProof&&this.homeView.bed,table:this.homeView.table,chest:this.homeView.chest,
        furnace:this.homeView.furnace,torch:this.homeView.torch,door_closed:this.homeView.doorClosed}:null,
      home_access:{...this.homeReturn,retryAt:this.backoff.return_home?.until||null},wool_budget:this.woolBudget};
  }
  scopedBot(generation) {
    const active=()=>{if(generation!==this.generation||this.dead)throw Object.assign(Error('Life changed during native work'),{code:'PILOT_LIFE_CHANGED'});};
    const guarded=new Set(['dig','craft','look','lookAt','equip','activateBlock','placeBlock','_placeBlockWithOptions',
      'consume','sleep','wake','openContainer','closeWindow','attack','waitForTicks','setControlState']);
    const client=new Proxy(this.bot._client||{}, {get:(target,key)=>{
      const value=Reflect.get(target,key);
      if(typeof value!=='function')return value;
      return (...args)=>{if(key==='write')active();return value.apply(target,args);};
    }});
    const resultGuard=(value,key)=>key==='openContainer'&&value?new Proxy(value,{get:(window,method)=>{
      const v=Reflect.get(window,method);
      if(typeof v!=='function')return v;
      return (...args)=>{active();const result=v.apply(window,args);return result?.then?result.then(value=>{active();return value;}):result;};
    }}):value;
    return new Proxy(this.bot,{get:(target,key)=>{
      if(key==='_client')return client;
      const value=Reflect.get(target,key);
      if(typeof value!=='function')return value;
      return (...args)=>{
        if(guarded.has(key))active();
        const result=value.apply(target,args);
        if(guarded.has(key)&&result?.then)return result.then(value=>{active();return resultGuard(value,key);});
        return resultGuard(result,key);
      };
    }});
  }
  onDeath(reason='death') {
    if(this.dead)return;
    // Persist the interrupted operation before the death marker. Otherwise a
    // death between periodic saves can revive an older, unrelated operation.
    this.save(true);
    this.generation++;this.dead=true;this.recovering=true;this.motor.pause();this.bedProof=null;this.loot=null;
    Promise.resolve(this.bot.stopDigging?.()).catch(()=>{});this.bot.deactivateItem?.();
    this.store.update({resume:[{goal:this.currentGoal,phase:this.teacher.phase,at:this.clock()}]},'work_interrupted_by_death');
    this.store.markDeath(point(this.bot.entity.position),reason);
    this.recoveryOrigin=this.clock();
    this.currentStatus='awaiting_respawn';this.message='Dead; waiting for the actual Minecraft respawn';
  }
  onRespawn(position=point(this.bot.entity.position),items=actualItems(this.bot)) {
    this.generation++;this.motor.pause();
    this.store.markRespawn(position,items);
    this.dead=false;this.recovering=this.store.snapshot().recovery.required===true;this.recoveryStarted=this.clock();
    this.recoveryOrigin=this.recovering?Math.min(this.clock(),this.store.snapshot().recovery.death?.at??this.clock()):this.clock();
    this.bedProof=null;this.loot=null;this.progressAt=this.clock();this.lastSignature=null;
    this.ignoredLoot.clear();this.lootBudgetAt=null;this.seenCells.clear();this.sessionMilestones.clear();
    this.teacher=freshTeacher(this.bot,this.frame,this.store.snapshot());
    this.discardRemoteBurrow();
    this.currentGoal=this.recovering?'recover':this.currentGoal;
    this.spawnReadyAt=this.clock()+1500;this.currentStatus='recovering';this.message='Rechecking actual respawn position and inventory';
  }
  discardRemoteBurrow() {
    const discarded=this.teacher.pilotDiscardedBurrow;
    if(!discarded)return false;
    this.store.update({construction:{burrow:null,phase:this.teacher.phase}},
      {kind:'remote_burrow_operation_discarded',...discarded,position:point(this.bot.entity.position)});
    delete this.teacher.pilotDiscardedBurrow;
    return true;
  }
  onDisconnect(reason='disconnected') {
    this.generation++;this.motor.pause();this.save(true);this.store.markDisconnected(reason);
    this.currentStatus='disconnected';this.message='Disconnected; persistent home and unfinished work retained';
  }
  defer(kind,reason) {
    const now=this.clock(),old=this.backoff[kind]||{attempts:0},attempts=old.attempts+1;
    this.backoff[kind]={attempts,until:now+(attempts>=3?Math.min(300000,60000*2**Math.min(2,attempts-3)):10000),reason:String(reason).slice(0,512)};
    if(kind==='return_home')this.backoff[kind].until=Math.max(this.backoff[kind].until,now+60000);
    if(kind==='repair_home'&&this.woolBudget?.needsUsefulFallback)this.backoff[kind].until=Math.max(this.backoff[kind].until,now+60000);
    this.currentStatus='replanning';this.message='Deferred '+kind+': '+String(reason).slice(0,200);
    this.store.transact(d=>{d.metrics.repeatedStalls++;d.goal={kind,status:'deferred',reason:this.message,retryAt:this.backoff[kind].until};},
      {kind:'goal_deferred',goal:kind,attempts,reason:String(reason).slice(0,256)});
    this.progressAt=now;this.teacher.error=null;this.teacher.deathRun=null;this.teacher.phase='gather';
    this.teacher.path=[];this.teacher.navigator=new WorldNavigation();this.teacher.resourceAt=0;this.teacher.tree=null;
    // The missing physical parts remain in the owned plan. A deferred repair
    // must not keep preempting alternate food/supply goals through stale task state.
    this.teacher.homeRepair=null;this.teacher.buildSupply=null;
    if(!this.teacher.wilderness.mine||['done','approach'].includes(this.teacher.wilderness.mine.stage)) {
      delete this.teacher.wilderness.toolRecovery;delete this.teacher.wilderness.stoneRecovery;
    }
  }
  verifiedBurrow() {
    const s=this.teacher.wilderness?.burrow,p=this.bot.entity.position;
    return !!s&&s.stage==='hidden'&&Math.abs(p.x-s.feet[0]-.5)<.65&&Math.abs(p.z-s.feet[2]-.5)<.65&&
      p.y>=s.feet[1]-2.5&&p.y<=s.feet[1]-.5&&this.bot.entity.onGround===true&&
      burrow.sealed(this.bot,s)&&burrow.walls(this.bot,new Vec3(...s.feet),s);
  }
  rememberShelter() {
    if(!this.verifiedBurrow())return false;
    const s=this.teacher.wilderness.burrow;
    if(this.backoff.return_home&&this.temporaryShelterProof!==s.feet.join(',')) {
      this.temporaryShelterProof=s.feet.join(',');
      this.store.transact(d=>{d.construction.temporaryShelter={position:[...s.feet],verified:true,verifiedAt:this.clock(),
        reason:'Home access deferred',cap:[...s.cap],lip:[...s.lip]};
        d.recovery.temporaryShelter={...d.construction.temporaryShelter};
        d.metrics.temporaryShelterVerifications=(d.metrics.temporaryShelterVerifications||0)+1;},'home_access_fallback_verified');
    }
    if(this.recovering){this.store.update({recovery:{temporaryShelter:{position:[...s.feet],verified:true,verifiedAt:this.clock()}}},'temporary_shelter_verified');
      this.completeRecovery('temporary_shelter_verified',{position:point(this.bot.entity.position),homeRetained:!!this.teacher.plot});}
    if(this.woolBudget?.needsUsefulFallback)this.completeResourceFallback('temporary_shelter');
    return true;
  }
  completeResourceFallback(kind) {
    if(!this.woolBudget?.needsUsefulFallback)return false;
    if(kind==='home') {
      const view=physicalHome(this.bot,this.teacher.plot,this.store.snapshot().construction.intendedFeatures||[]);
      if(!view.loaded||!view.usable||!secureInterior(this.bot,this.teacher.plot))return false;
    } else if(kind==='temporary_shelter') {if(!this.verifiedBurrow())return false;}
    else return false;
    const proof={kind,position:point(this.bot.entity.position),verified:true,verifiedAt:this.clock(),reason:'Wool unavailable; checked useful fallback'};
    this.woolBudget.needsUsefulFallback=false;this.woolBudget.fallback=proof;
    this.store.transact(d=>{d.construction.woolBudget=plain(this.woolBudget);
      if(kind==='temporary_shelter'){d.construction.temporaryShelter=proof;d.recovery.temporaryShelter=proof;}
      d.metrics.resourceFallbacks=(d.metrics.resourceFallbacks||0)+1;},'wool_recovery_fallback_verified');
    return true;
  }
  async resourceRecovery(generation) {
    const b=this.activeBot||this.bot,t=this.teacher,now=this.clock();
    const mine=t.wilderness.mine;
    if(mine&&mine.stage!=='done') {
      mine.stage='exit';mine.exitIndex??=mine.path.length-1;
      mine.reason='Leaving checked stairs before replanning an unavailable resource';
      await require('../controller/staircase_mining').tick(t,b,this.motor,this.frame,this.api,this.scan,this.tasks);
      this.message=t.message;return;
    }
    if(await require('../controller/water_work').tick(t,b,this.motor,this.frame,this.api,this.scan,this.tasks)) {
      this.message=t.message;return;
    }
    if(this.completeResourceFallback('home')) {this.message='Returned to the checked home after deferring unavailable wool';return;}
    // Unloaded remembered construction is unknown, not new damage. Do not
    // start another long search while the prior missing resource is deferred.
    const near=t.plot&&b.entity.position.distanceTo(new Vec3(t.plot.x+.5,t.plot.y,t.plot.z+.5))<=48;
    if(near&&this.homeView?.loaded&&this.homeView.usable&&!shelter.threats(b).length&&
      (this.backoff.return_home?.until||0)<=now) {
      this.woolBudget.returnAt??=now;
      const arrived=await t.walk(b,this.motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],this.frame,this.api,this.scan,this.tasks);
      if(generation!==this.generation)return;
      if(this.completeResourceFallback('home'))return;
      if(arrived!==false&&now-this.woolBudget.returnAt<30000){this.message='Checking the practical home route before resuming useful work';return;}
    }
    await this.temporaryCover(generation);
    this.rememberShelter();
  }
  progress() {
    const b=this.bot,view=this.homeView;
    const cell=b.entity.position.floored().toString();
    const signature=JSON.stringify(actualItems(b))+'|'+(view?.matched||0)+'|'+!!view?.bed;
    if(signature!==this.lastSignature||!this.seenCells.has(cell))this.progressAt=this.clock();
    this.lastSignature=signature;this.seenCells.add(cell);
    if(this.seenCells.size>2048)this.seenCells=new Set([cell]);
  }
  woolRecoveryBudget(elapsed=0) {
    const t=this.teacher,b=this.bot,n=t.wilderness,now=this.clock();
    const paused=this.dead||this.recovering||b.isSleeping||b.entity.onGround!==true||b.entity.isInWater||b.entity.isInLava||
      t.airEscape||t.waterWork||t.waterTravel||n.burrow||n.mine&&n.mine.stage!=='done'||
      n.forageResume||t.phase==='night_forage'||SAFETY.has(t.phase)||shelter.assess(b,this.frame.world,t).mode!=='work';
    const active=this.currentGoal==='repair_home'&&!this.homeView?.bed&&
      (t.homeRepair?.stage==='wool'||['night_wool','night_wool_home','night_bed'].includes(t.phase));
    if(!active)return false;
    const wool=count(b,'white_wool'),proof=this.bedProof?.at||null;
    const q=this.woolBudget??={activeMs:0,lastWool:wool,lastBedProof:proof,attempt:1};
    // The repair planner reaches its wool stage only after inspecting the
    // missing owned bed. Keep that task intent when those chunks unload;
    // neither travel nor an ordinary four-meal stocking target cancels it.
    if(t.homeRepair?.stage==='wool'||this.homeView?.loaded&&!this.homeView.bed)q.pending=true;
    if(q.deferredAt) {
      if((this.backoff.repair_home?.until||0)>now)return false;
      q.activeMs=0;q.deferredAt=null;q.attempt=(q.attempt||1)+1;
    }
    const acquired=wool>q.lastWool||proof&&proof!==q.lastBedProof;
    if(acquired)q.activeMs=0;
    q.lastWool=wool;q.lastBedProof=proof;q.paused=!!paused;q.checkedAt=now;
    if(paused)return false;
    if(!acquired)q.activeMs+=Math.max(0,Math.min(10000,elapsed));
    if(q.activeMs<180000)return false;
    q.deferredAt=now;q.needsUsefulFallback=true;q.returnAt=null;
    this.defer('repair_home','No white-wool acquisition or replacement-bed proof during 180 active seconds; trying another useful priority');
    return true;
  }
  save(force=false) {
    const now=this.clock();if(!force&&now-this.lastSave<1500)return;this.lastSave=now;
    const t=this.teacher,view=this.homeView;
    this.store.transact(d=>{
      if(t.plot){d.ownership.plot=plain(t.plot);d.ownership.blueprint='shared-house-7x7-v1';
        d.home={...(d.home||{}),plot:plain(t.plot),position:[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],verified:!!view?.usable,
          bed:{position:house.point(t.plot,'bed').toArray(),verified:!!view?.bed&&!!this.bedProof,proof:this.bedProof}};}
      d.construction={...d.construction,phase:t.phase,stage:this.established?'maintaining':'building',established:this.established,
        backoff:plain(this.backoff),memory:t.wilderness?.memory.snapshot()||{},mine:trackedMine(t.wilderness?.mine),
        homeReturn:plain(this.homeReturn),woolBudget:this.woolBudget?plain(this.woolBudget):null,
        burrow:trackedBurrow(t.wilderness?.burrow),intendedFeatures:[...new Set([...(d.construction.intendedFeatures||[]),
          ...['chest','furnace','torch'].filter(k=>view?.[k]),...(view?.bed?['bed_home']:[])])],
        workPhase:this.resumePhase,planner:Object.fromEntries(['prebuildLighting','earlyLighting','lightingPrepared','resume','coverResume','forageResume','fuelTrip']
          .filter(k=>['string','boolean'].includes(typeof t.wilderness?.[k])).map(k=>[k,t.wilderness[k]]))};
      d.goal={kind:this.currentGoal,status:this.currentStatus,phase:t.phase,reason:this.message};
      d.lastObservation={position:point(this.bot.entity.position),inventory:actualItems(this.bot),at:now,trusted:true};
      d.recovery.needsRevalidation=false;
      for(const [key,value] of Object.entries(this.pendingMetrics))d.metrics[key]=(d.metrics[key]||0)+value;
    });
    this.pendingMetrics={};
  }
  completeRecovery(outcome,evidence) {
    if(!this.recovering)return false;
    if(outcome==='returned_to_owned_home') {
      const view=physicalHome(this.bot,this.teacher.plot,this.store.snapshot().construction.intendedFeatures||[]);
      if(!view.loaded||!view.usable||!secureInterior(this.bot,this.teacher.plot))return false;
    } else if(outcome==='temporary_shelter_verified') {if(!this.verifiedBurrow())return false;}
    else return false;
    const duration=Math.max(0,this.clock()-this.recoveryOrigin);
    this.store.transact(d=>{d.metrics.recoveries++;d.metrics.recoveryMilliseconds=(d.metrics.recoveryMilliseconds||0)+duration;
      d.recovery.required=false;d.recovery.phase='resumed';d.recovery.lastOutcome={outcome,at:this.clock(),durationMs:duration,evidence};
      d.goal.status='resuming';d.recovery.resumeIntent=d.resume[0]||null;}, {kind:'recovery_verified',outcome});
    this.recovering=false;
    return true;
  }
  async recover(generation) {
    const b=this.activeBot||this.bot,t=this.teacher,death=this.store.snapshot().recovery.death,now=this.clock();
    if(!shelter.threats(b).length&&death&&now-death.at<=120000&&death.position&&b.entity.position.distanceTo(new Vec3(...death.position))<=24&&
      (this.lootBudgetAt===null||now-this.lootBudgetAt<15000)) {
      const candidates=Object.values(b.entities||{}).filter(e=>e.name==='item'&&e.isValid!==false&&e.position&&e.position.distanceTo(b.entity.position)<24&&
        !this.ignoredLoot.has(e.id)&&require('../controller/survival').itemName(b,e)&&require('../controller/combat').visible(b,e));
      const e=candidates.find(e=>!this.loot||this.loot.id===e.id);
      if(e) {
        if(!this.loot){this.lootBudgetAt??=now;this.loot={id:e.id,at:now,before:JSON.stringify(actualItems(b))};}
        const q=e.position.floored(),goal=[q.x+.5,q.y+.1,q.z+.5];
        if(now-this.loot.at<8000&&nav.standable(b,q.x,q.y,q.z)&&nav.route(b,goal,24,2048,true,{bounds:this.frame.world.bounds,reversible:true}).reached) {
          if(b.entity.position.distanceTo(e.position)<1.2){this.motor.pause();await inventory.sync(b);
            if(JSON.stringify(actualItems(b))!==this.loot.before){this.pendingMetrics.verifiedDropPickups=(this.pendingMetrics.verifiedDropPickups||0)+1;this.ignoredLoot.add(e.id);}}
          else await t.walk(b,this.motor,goal,this.frame,this.api,this.scan,this.tasks);
          if(generation!==this.generation)return;
          this.message='Recovering a visible nearby drop over a checked route';return;
        }
        this.ignoredLoot.add(e.id);
      }
    }
    this.loot=null;
    if((this.backoff.return_home?.until||0)<=now&&t.plot&&b.entity.position.distanceTo(new Vec3(t.plot.x+.5,t.plot.y+.1,t.plot.z+.5))<96&&!shelter.threats(b).length) {
      const target=[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5];
      const arrived=await t.walk(b,this.motor,target,this.frame,this.api,this.scan,this.tasks);
      if(generation!==this.generation)return;
      if(arrived===true){this.homeView=physicalHome(b,t.plot,this.store.snapshot().construction.intendedFeatures||[]);
        if(this.homeView.loaded&&this.homeView.usable){this.completeRecovery('returned_to_owned_home',{position:point(b.entity.position),shelterUsable:true});return;}
        if(this.homeView.loaded&&this.established) {
          const materials=homeRepair.budget(this.homeView.missing,b),intended=this.store.snapshot().construction.intendedFeatures||[];
          if(wood(b)>=materials.woodNeeded&&count(b,n=>LOG.test(n))>=materials.rawLogs) {
            const verified=t.milestones;t.milestones=['hut',...intended];
            try{await homeRepair.tick(t,b,this.motor,this.frame,this.api,this.scan,this.tasks);}
            finally{t.milestones=verified;}
            this.message=t.message||'Restoring the checked home before crediting recovery';return;
          }
        }
      }
      if(arrived!==false&&now-this.recoveryStarted<45000){this.message='Returning through checked terrain after respawn';return;}
    }
    await this.temporaryCover(generation);
  }
  async temporaryCover(generation=this.generation) {
    const b=this.activeBot||this.bot,t=this.teacher;
    if(!t.wilderness.burrow) {
      const feet=burrow.find(t,b,this.frame);
      if(feet) {const sides=[[1,0],[-1,0],[0,1],[0,-1]].filter(([x,z])=>b.blockAt(feet.offset(x,0,z))?.name==='air');
        if(sides.length){t.wilderness.burrow={feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(...[sides[0][0],0,sides[0][1]]).toArray(),
          stage:'approach',resume:'gather',at:Date.now(),progressAt:Date.now(),reason:'Checked temporary cover after a distant or unsafe respawn'};t.phase='night_burrow';}}
    }
    if(t.wilderness.burrow) {
      await burrow.tick(t,b,this.motor,this.frame,this.api,this.scan,this.tasks);
      if(generation!==this.generation)return;
      const s=t.wilderness.burrow;
      this.rememberShelter();
      this.message=t.message;return;
    }
    // Failure to find cover is observable, not credited as a useful fallback.
    await burrow.seek(t,b,this.motor,this.frame,this.api,this.scan,this.tasks);
    this.message=t.message||'No safe home route or dry shelter yet; searching checked terrain';
  }
  async registerBed() {
    const t=this.teacher,b=this.activeBot||this.bot,p=house.point(t.plot,'bed');
    if(b.entity.position.distanceTo(p) > 3) {await t.walk(b,this.motor,[t.plot.x+1.5,t.plot.y+.1,t.plot.z+.5],this.frame,this.api,this.scan,this.tasks);return;}
    this.motor.pause();await this.api('/world/survival',{agent:b.username,run:this.run,action:'home',position:p.toArray()});
    if(this.bedProof){t.milestone('bed_home');this.message='Real bed and native respawn point verified';}
  }
  async inspectStorage(replenish=true) {
    const b=this.activeBot||this.bot,t=this.teacher;
    if(!this.homeView?.chest||this.clock()-this.lastStorageAt<10000)return false;
    const block=b.blockAt(house.point(t.plot,'chest'));
    if(block?.name!=='chest'||b.entity.position.distanceTo(block.position)>3.5)return false;
    this.lastStorageAt=this.clock();let window,changed=false;
    try {
      window=await b.openContainer(block);
      const contents=()=>window.slots.slice(0,window.inventoryStart).filter(Boolean);
      // Only use native container transfers and actual observed stacks. The
      // durable record is a checked storage location, never an item supply.
      if(replenish&&typeof window.withdraw==='function') {
        const candidate=contents().find(i=>
          i.name.endsWith('_axe')&&!tool(b,'axe')||i.name.endsWith('_pickaxe')&&!tool(b,'pickaxe')||
          ['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_rabbit','apple','bread'].includes(i.name)&&firstNight.meals(b)<4||
          (LOG.test(i.name)||i.name.endsWith('_planks'))&&wood(b)<16);
        if(candidate){const before=JSON.stringify(actualItems(b));
          const amount=candidate.name.endsWith('_axe')||candidate.name.endsWith('_pickaxe')?1:
            Math.min(candidate.count,LOG.test(candidate.name)?Math.ceil((16-wood(b))/4):candidate.name.endsWith('_planks')?16-wood(b):4-firstNight.meals(b));
          if(amount>0){await window.withdraw(candidate.type,candidate.metadata||0,amount);await inventory.sync(b);
            changed=JSON.stringify(actualItems(b))!==before;}}
      }
      const stored=contents().map(i=>({name:i.name,count:i.count}));
      this.store.update({storage:[{id:'home_chest',position:block.position.toArray(),verified:true,verifiedAt:this.clock(),observedContents:stored}]},'storage_inspected');
      if(stored.filter(i=>i.name.endsWith('_planks')).reduce((n,i)=>n+i.count,0)>=8)this.sessionMilestones.add('stocked');
      if(changed){this.pendingMetrics.storageRecoveries=(this.pendingMetrics.storageRecoveries||0)+1;this.message='Recovered a verified essential supply from the real home chest';}
    } finally {if(window&&b.currentWindow)await b.closeWindow(window);}
    return changed;
  }
  async watch() {
    const b=this.activeBot||this.bot,t=this.teacher;
    if(!this.homeView.usable){this.currentGoal='repair_home';return;}
    if(!secureInterior(b,t.plot)) {
      const now=this.clock();this.homeReturn.startedAt??=now;
      const arrived=await t.walk(b,this.motor,[t.plot.x+.5,t.plot.y+.1,t.plot.z+.5],this.frame,this.api,this.scan,this.tasks);
      if(arrived===false||now-this.homeReturn.startedAt>=30000) {
        this.homeReturn={blockedAt:now,reason:'Checked home return is blocked',verified:false};
        this.defer('return_home','Checked entrance route refused or did not complete within 30 seconds; preserving the obstruction and checking temporary cover');
        this.currentGoal='temporary_cover';await this.temporaryCover();return;
      }
      this.lastMode='travel';this.message='Returning to the verified home for maintenance';return;
    }
    this.homeReturn={verified:true,checkedAt:this.clock()};delete this.backoff.return_home;this.temporaryShelterProof=null;
    this.motor.pause();const door=b.blockAt(new Vec3(t.plot.x,t.plot.y,t.plot.z-3));
    if(door.getProperties().open){await require('../controller/door_care').closeDoor(b,door);this.message='Closing the home door';return;}
    if(this.currentGoal==='shelter_watch') {
      if(t.phase!=='night_hold')this.resumePhase=t.wilderness.resume||t.phase;
      t.phase='night_hold';
      // The native adapter attests NORMAL-world sleeping, including custom world keys.
      if(!b.isSleeping&&this.homeView.bed&&this.clock()>=(this.bedRetryAt||0)) {this.bedRetryAt=this.clock()+15000;await this.registerBed();}
      this.lastMode='shelter_watch';this.message=b.isSleeping?'Sleeping in the real home bed':'Verified shelter watch; waiting for a safe work period';
    } else {
      this.lastMode='maintenance';this.message='Home verified; essential maintenance targets currently satisfied';
      await this.inspectStorage();
      const stored=this.store.snapshot().storage[0]?.observedContents||[];
      if(!stored.some(i=>i.name.endsWith('_planks')&&i.count>=8)&&count(b,n=>n.endsWith('_planks'))>=8&&wood(b)>=24&&
        this.clock()>=(this.restockAt||0)) {
        this.restockAt=this.clock()+60000;
        const total=await require('../controller/settlement').stockChest(b,b.blockAt(house.point(t.plot,'chest')),8);
        if(total>=8){this.sessionMilestones.add('stocked');this.pendingMetrics.storageDeposits=(this.pendingMetrics.storageDeposits||0)+1;
          this.lastStorageAt=-Infinity;await this.inspectStorage(false);this.message='Verified eight real reserve planks in the home chest';}
      }
    }
  }
  async survey(generation) {
    const b=this.activeBot||this.bot,t=this.teacher,now=this.clock(),p=b.entity.position,bounds=this.frame.world.bounds;
    this.currentGoal='establish_home';this.currentStatus='surveying';
    if(t.wilderness.burrow||shelter.assess(b,this.frame.world,t).mode!=='work') {
      if(await firstNight.interrupt(t,b,this.motor,this.frame,this.api,this.scan)) {
        if(generation!==this.generation)return;
        this.rememberShelter();this.message=t.message;this.lastMode=this.verifiedBurrow()?'shelter_watch':'survival';this.save();return;
      }
    }
    if(now-this.lastPlotSearch>=2500) {
      this.lastPlotSearch=now;this.plotSearches++;
      const local=[Math.max(bounds[0],Math.floor(p.x)-24),Math.min(bounds[1],Math.floor(p.x)+24),
        Math.max(bounds[2],Math.floor(p.z)-24),Math.min(bounds[3],Math.floor(p.z)+24)];
      const plot=findPlot(b,local,0,12,1,[]);
      if(plot&&nav.route(b,[plot.x+.5,plot.y+.1,plot.z+.5],48,2048,true,{bounds,reversible:true}).reached) {
        t.plot=plot;t.table=house.point(plot,'table');t.campPlots=[plot];t.phase='clear_plot';t.afterPlotClear='gather';
        this.store.update({ownership:{plot:plain(plot),blueprint:'shared-house-7x7-v1'},construction:{phase:t.phase}},'plot_claimed');return;
      }
    }
    const explore=t.wilderness.exploration;
    if(t.pilotSurveyGoal) {
      const arrived=await t.walk(b,this.motor,t.pilotSurveyGoal,this.frame,this.api,this.scan,this.tasks);
      if(generation!==this.generation)return;
      if(arrived===false||arrived===true||now-(t.pilotSurveyAt||0)>30000) {
        explore.reject(b,t.pilotSurveyGoal);t.pilotSurveyGoal=null;this.surveyRetryAt=now+1000;
      }
      this.lastMode='travel';this.message='Surveying another reachable natural patch for the home';this.progress();this.save();return;
    }
    if(now>=(this.surveyRetryAt||0)) {
      this.surveyRetryAt=now+10000;
      t.pilotSurveyGoal=await explore.choose(b,{...this.frame.world,run:this.run,plots:[]},surface,[],'home');
      if(generation!==this.generation)return;
      t.pilotSurveyAt=now;
      this.pendingMetrics.surveyReplans=(this.pendingMetrics.surveyReplans||0)+1;
    }
    this.motor.pause();this.lastMode='survey';this.message=t.pilotSurveyGoal?'Checked a new survey route; continuing on the next step':
      'No safe loaded house plot or survey route yet; bounded terrain recheck in ten seconds';this.save();
  }
  async tick() {
    const generation=this.generation, b=this.scopedBot(generation),t=this.teacher,now=this.clock();
    this.operationGeneration=generation;this.activeBot=b;
    const elapsed=Math.max(0,Math.min(10000,now-this.lastAt));this.lastAt=now;
    if(this.dead||b.health<=0){if(!this.dead)this.onDeath('health reached zero');this.motor.pause();return this.status();}
    this.pendingMetrics.activeMilliseconds=(this.pendingMetrics.activeMilliseconds||0)+elapsed;
    const activityKey=this.lastMode==='shelter_watch'?'shelterWatchMilliseconds':this.lastMode==='travel'?'travelMilliseconds':'workMilliseconds';
    this.pendingMetrics[activityKey]=(this.pendingMetrics[activityKey]||0)+elapsed;
    if(now<(this.spawnReadyAt||0)){this.motor.pause();this.message='Waiting for post-respawn chunks and footing';return this.status();}
    try {
      if(require('../controller/air_escape').tick(t,b,this.motor,this.frame)){this.lastMode='survival';this.message=t.message;return this.status();}
      if(!t.plot) {
        await this.survey(generation);if(generation!==this.generation||!t.plot)return this.status();
      }
      const saved=this.store.snapshot(),intended=saved.construction.intendedFeatures||[];
      this.homeView=physicalHome(b,t.plot,intended);
      for(const name of t.milestones)this.sessionMilestones.add(name);
      t.milestones=[...this.sessionMilestones].filter(name=>!['hut','chest','furnace','torch','bed_home'].includes(name));
      if(this.homeView.usable)t.milestone('hut');
      for(const name of ['chest','furnace','torch'])if(this.homeView[name])t.milestone(name);
      if(this.homeView.bed&&this.bedProof)t.milestone('bed_home');
      if(!this.homeView.bed)this.bedProof=null;
      t.homeDamage={missing:this.homeView.missing,unknown:this.homeView.unknown,unsafe:!this.homeView.usable,checked_at:Date.now()};
      t.wilderness.bootstrap=this.homeView.table&&tool(b,'axe');
      if(this.homeView.torch||count(b,'torch')>=10)t.wilderness.lightingKitReady=true;
      this.progress();
      const danger=shelter.assess(b,this.frame.world,t).mode!=='work';
      if(danger||t.wilderness.burrow||SAFETY.has(t.phase)||this.woolBudget?.pending||this.woolBudget?.needsUsefulFallback) {
        this.rememberShelter();
        // A checked, sealed refuge remains a deliberate watch during the short
        // home-route backoff. Recheck its actual dry shell every step; air and
        // damaged-cover recovery still preempt this hold.
        const resourceHold=this.woolBudget?.fallback?.kind==='temporary_shelter'?(this.backoff.repair_home?.until||0):0;
        const coverHold=Math.max(this.backoff.return_home?.until||0,resourceHold);
        if(this.verifiedBurrow()&&coverHold>now) {
          this.motor.pause();this.currentGoal='temporary_cover';this.currentStatus='working';this.lastMode='shelter_watch';
          this.message='Verified temporary shelter; '+(resourceHold?'resource retry':'home access recheck')+' in '+Math.ceil((coverHold-now)/1000)+' seconds';
          this.save();return this.status();
        }
        if(await firstNight.interrupt(t,b,this.motor,this.frame,this.api,this.scan)) {
          if(generation!==this.generation)return this.status();
          await burrowBootstrap.tick(t,b,this.motor,{now:this.clock(),checkpoint:()=>this.save(true)});
          if(generation!==this.generation)return this.status();
          this.rememberShelter();
          this.currentGoal='survival';this.currentStatus='working';this.message=t.message;this.lastMode=t.wilderness.burrow?.stage==='hidden'?'shelter_watch':'survival';
          this.save();return this.status();
        }
      }
      if(this.established&&this.homeView.usable&&secureInterior(b,t.plot)&&
        (!tool(b,'axe')||!tool(b,'pickaxe')||firstNight.meals(b)<4||wood(b)<16)) {
        if(await this.inspectStorage()){this.progress();this.save();return this.status();}
      }
      this.currentGoal=chooseGoal({alive:true,danger:false,recovering:this.recovering,hasPlot:!!t.plot,established:this.established,
        home:this.homeView,meals:firstNight.meals(b),axe:tool(b,'axe'),pickaxe:tool(b,'pickaxe'),
        bedVerified:!!this.bedProof,wood:wood(b),night:shelter.danger(b),backoff:this.backoff,insideHome:secureInterior(b,t.plot),
        needsUsefulFallback:!!this.woolBudget?.needsUsefulFallback,
        pendingWoolRepair:!!this.woolBudget?.pending&&!this.woolBudget?.deferredAt,now}).kind;
      this.currentStatus='working';
      if(this.woolRecoveryBudget(elapsed)){this.save(true);return this.status();}
      if(t.phase==='night_hold'&&this.currentGoal!=='shelter_watch') {
        t.phase=this.established?'night_recover':validPhase(this.resumePhase)&&this.resumePhase!=='night_hold'?this.resumePhase:'gather';
        this.resumePhase=null;t.lastProgress=Date.now();
      }
      if(this.currentGoal!=='supplies'&&Object.hasOwn(t,'woodReady'))delete t.woodReady;
      if(this.currentGoal==='recover'){await this.recover(generation);this.lastMode='recovery';}
      else if(this.currentGoal==='resource_recovery'){await this.resourceRecovery(generation);this.lastMode='recovery';}
      else if(this.currentGoal==='temporary_cover'){await this.temporaryCover(generation);this.lastMode='recovery';}
      else if(this.currentGoal==='register_bed'){await this.registerBed();this.lastMode='maintenance';}
      else if(['shelter_watch','maintenance'].includes(this.currentGoal)){await this.watch();}
      else {
        if(this.currentGoal==='repair_home'&&this.established) {
          const verified=t.milestones;t.milestones=['hut',...intended];
          try {if(await homeRepair.tick(t,b,this.motor,this.frame,this.api,this.scan,this.tasks)){
            if(generation!==this.generation)return this.status();
            this.homeView=physicalHome(b,t.plot,intended);this.progress();this.message=t.message;this.lastMode='repair';
            this.woolRecoveryBudget(0);
            if(now-this.progressAt>90000)this.defer('repair_home','No verified repair or resupply progress for 90 seconds');
            this.save();return this.status();}}
          finally {t.milestones=verified;}
        }
        if(this.established&&!SAFETY.has(t.phase)&&!t.homeRepair&&!t.wilderness.toolRecovery&&!t.wilderness.stoneRecovery) {
          if(this.currentGoal==='food'&&!['night_food','night_food_home','night_cook','night_food_return','night_forage'].includes(t.phase))t.phase='night_food';
          if(this.currentGoal==='tools'){const requested=!tool(b,'axe')?'wooden_axe':'wooden_pickaxe';require('../controller/tool_recovery').request(t,requested);}
          if(this.currentGoal==='supplies'){t.phase='gather';t.supplyRun=true;t.woodReady=bot=>wood(bot)>=16;}
        }
        if(this.homeView.bed&&t.phase==='night_bed'){await this.registerBed();if(this.bedProof)t.phase='night_scout';}
        else {
          // Trial-only deadlines are replaced by the bounded continuing goal
          // supervisor. Native action and physical-safety deadlines are untouched.
          t.started=Date.now();t.deathRun=null;t.error=null;
          await t.tick(b,this.motor,this.frame,this.api,this.scan,this.tasks);
        }
        if(generation!==this.generation)return this.status();
        this.message=t.error||t.message||t.phase;this.lastMode=t.navigationActive?'travel':'work';
        if(t.phase==='stopped')this.defer(this.currentGoal,this.message);
        if(this.currentGoal==='supplies'&&wood(b)>=16){this.store.transact(d=>{d.metrics.completedGoals++;},'supplies_replenished');t.phase='night_recover';}
      }
      if(generation!==this.generation)return this.status();
      const after=physicalHome(b,t.plot,intended);this.homeView=after;
      const features=['chest','furnace','torch'].filter(k=>after[k]);if(after.bed&&this.bedProof)features.push('bed_home');
      const ready=after.usable&&after.chest&&after.furnace&&after.torch&&after.bed&&this.bedProof;
      if(ready&&!this.established){this.established=true;this.store.transact(d=>{d.construction.established=true;d.construction.intendedFeatures=features;d.metrics.completedGoals++;},'home_established');}
      if(this.established&&(['complete','night_scout','night_scout_home'].includes(t.phase)||t.phase==='night_hold'&&this.currentGoal!=='shelter_watch'))t.phase='night_recover';
      if(now-this.progressAt>90000&&!['shelter_watch','maintenance'].includes(this.currentGoal)&&!b.isSleeping)
        this.defer(this.currentGoal,'No verified movement, inventory or construction progress for 90 seconds');
      this.save();
    } catch(error) {
      this.motor.pause();
      if(generation!==this.generation||error.code==='PILOT_LIFE_CHANGED')return this.status();
      burrow.captureFailure(t,b,error);this.defer(this.currentGoal,error.message);this.save(true);
    }
    return this.status();
  }
}

module.exports={PilotLife,physicalHome,chooseGoal,freshTeacher,actualItems,trackedMine,trackedBurrow,localBurrow};

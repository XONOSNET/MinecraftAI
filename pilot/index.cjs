'use strict';

// Standalone, opt-in continuing life. It never joins the production assignment
// or training APIs, and has no authority to reset or supply the continuing world.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {randomUUID} = require('node:crypto');
const {Vec3} = require('vec3');
const {open: openState} = require('./state.cjs');
const ROOT = path.resolve(__dirname, '..');
const PRIMARY = 'lab_persistent_pilot', IDENTITY = 'HomeAI01', DAY = 24000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));

function atomicJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), {recursive:true});
  const temporary = filename + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, filename);
}
function inventory(bot) {
  return bot.inventory.items().map(item => ({name:item.name, count:item.count, slot:item.slot}));
}
function playerUUID(bot) {
  // Mineflayer exposes the authenticated protocol UUID on its client, not as
  // bot.uuid. Never substitute a username-derived guess for this native value.
  const uuid=bot?._client?.uuid || bot?.entity?.uuid;
  if(typeof uuid!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) throw Error('Native player UUID is unavailable');
  return uuid.toLowerCase();
}
function point(value) {
  if (!value || !['x','y','z'].every(k => Number.isFinite(value[k]))) throw Error('Unverified world position');
  return [value.x, value.y, value.z];
}
function cameraWatchHeight(bot, life) {
  // This is a viewer-only fallback for a sealed shelter watch. Read only the
  // resident's already loaded column; unknown terrain cannot supply a camera.
  if(life?.phase!=='night_burrow' || life.activity!=='shelter_watch' || !bot?.entity?.position || typeof bot.blockAt!=='function') return null;
  const position=bot.entity.position;
  if(!['x','y','z'].every(key=>Number.isFinite(position[key])))return null;
  const x=Math.floor(position.x),z=Math.floor(position.z),floor=Math.floor(position.y),column=[];
  try {
    for(let y=floor+2;y<=floor+24;y++) {
      const block=bot.blockAt(new Vec3(x,y,z));
      if(!block)return null;
      column.push(block);
    }
  }catch{return null;}
  let highest=-1;
  for(let index=0;index<column.length;index++) if(column[index].boundingBox==='block' ||
    column[index].shapes?.some(shape=>Array.isArray(shape) && shape.length===6 && shape[3]>shape[0] && shape[4]>shape[1] && shape[5]>shape[2]))highest=index;
  if(highest<0 || highest+2>=column.length || !column.slice(highest+1,highest+3).every(block=>['air','cave_air','void_air'].includes(block.name)))return null;
  const height=floor+2+highest+2.5-position.y;
  return Number.isFinite(height) && height>=2 && height<=28?height:null;
}
function validateOptions(options) {
  const fixture = options.fixture === true;
  const world = options.world || PRIMARY, identity = options.identity || IDENTITY;
  if (fixture) {
    if (!/^lab_pilot_fixture_[a-z0-9_]{1,24}$/.test(world) || !/^PilotTest0[1-4]$/.test(identity) || options.serverPort !== 25571)
      throw Error('Fixture pilot must use its isolated world, identity and port');
  } else if (world !== PRIMARY || identity !== IDENTITY || (options.serverPort || 25565) !== 25565) {
    throw Error('The continuing pilot has one fixed identity and world');
  }
  return {...options,fixture,world,identity,serverPort:options.serverPort || 25565};
}
function validRequest(req, port) {
  const hosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  return hosts.has(req.headers.host) && (!req.headers.origin ||
    ['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(req.headers.origin));
}
function cameraRequest(action, payload={}) {
  if(!['start','stop'].includes(action) || !payload || Array.isArray(payload) || typeof payload!=='object') throw Error('Choose start or stop watching');
  const fields=action==='start'?['player','distance','height','night_vision']:['player'];
  if(Object.keys(payload).some(key=>!fields.includes(key))) throw Error('Unknown pilot camera setting');
  const player=payload.player ?? 'Xonosnet';
  if(typeof player!=='string' || !/^[A-Za-z0-9_]{3,16}$/.test(player) || /^(?:HomeAI01|LabAI[0-9]+|PilotTest0[1-4])$/i.test(player)) throw Error('Choose your human Minecraft player name');
  if(action==='stop') return {player};
  const distance=payload.distance ?? 3,height=payload.height ?? 3,night=payload.night_vision ?? true;
  if(typeof distance!=='number' || !Number.isFinite(distance) || distance<1 || distance>16 ||
     typeof height!=='number' || !Number.isFinite(height) || height<2 || height>12 || typeof night!=='boolean')
    throw Error('Camera distance must be 1–16, height 2–12, and night vision enabled or disabled');
  return {player,target:IDENTITY,view:'shoulder',distance,height,cycle_enabled:false,active_only:false,night_vision:night};
}
async function cameraBody(req) {
  // A camera request cannot retain an unbounded body or an idle HTTP handler.
  return new Promise((resolve,reject)=>{
    let body='',size=0,done=false;
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);
      req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',fail);req.removeListener('aborted',abort);
      if(error){req.resume();reject(error);}else resolve(value);
    };
    const timer=setTimeout(()=>finish(Error('Camera request timed out')),2000);
    const data=chunk=>{size+=chunk.length;if(size>2048)finish(Error('Camera request is too large'));else body+=chunk;};
    const end=()=>{try{finish(null,body?JSON.parse(body):{});}catch{finish(Error('Enter valid camera settings'));}};
    const fail=()=>finish(Error('Camera request was interrupted')),abort=()=>finish(Error('Camera request was interrupted'));
    req.on('data',data);req.on('end',end);req.on('error',fail);req.on('aborted',abort);
  });
}
class HttpBridge {
  constructor(base='http://127.0.0.1:8000', tokenPath=path.join(ROOT,'data/api-token')) {
    const url=new URL(base);
    if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname)) throw Error('Pilot broker must be loopback-only');
    this.base=base;this.tokenPath=tokenPath;
  }
  async world(payload) {
    const token=fs.readFileSync(this.tokenPath,'utf8').trim();
    const result=await fetch(this.base+'/pilot/world',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
    if (!result.ok) throw Error('Pilot world control: '+result.status+' '+(await result.text()).slice(0,300));
    return result.json();
  }
  async health() {
    // Fetch ignores a caller-supplied Host header in current Node. Use the
    // endpoint's direct localhost authority, which the LAN proxy cannot supply.
    const url=new URL(this.base+'/fixture/health');
    if(url.hostname==='127.0.0.1')url.hostname='localhost';
    const result=await fetch(url.href,{signal:AbortSignal.timeout(5000)});
    if (!result.ok) throw Error('Lab health unavailable');
    return result.json();
  }
  async camera(action,payload) {
    const body=cameraRequest(action,payload),token=fs.readFileSync(this.tokenPath,'utf8').trim();
    const result=await fetch(this.base+'/observer/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!result.ok) {
      const message=(await result.text()).slice(0,300);
      if(result.status===400 && /configured training bot/i.test(message)) throw Error('The open-world camera is awaiting the dashboard update. Your bot is still running.');
      throw Error('Camera control: '+result.status+' '+message);
    }
    return result.json();
  }
}

class PilotSupervisor {
  constructor(options={}) {
    this.options=validateOptions(options); this.bridge=options.bridge || new HttpBridge();
    this.directory=path.resolve(options.directory || path.join(ROOT,'data/persistent-pilot'));
    this.logs=path.resolve(options.logs || path.join(ROOT,'logs/persistent-pilot'));
    fs.mkdirSync(this.directory,{recursive:true}); fs.mkdirSync(this.logs,{recursive:true});
    this.controlPath=path.join(this.directory,'control.json');
    this.control=fs.existsSync(this.controlPath)?JSON.parse(fs.readFileSync(this.controlPath,'utf8')):{schema:1,enabled:false,identity:this.options.identity,world:this.options.world};
    if(this.control.schema!==1 || typeof this.control.enabled!=='boolean') throw Error('Invalid pilot control record; explicit operator review required');
    if (this.control.identity!==this.options.identity || this.control.world!==this.options.world) throw Error('Pilot control belongs to another scope');
    this.bot=null;this.life=null;this.store=null;this.motor=null;this.ready=false;this.connecting=false;this.busy=false;
    this.generation=0;this.lastHealthAt=0;this.lastWorldAt=0;this.lastSaveAt=0;this.lastActivityAt=0;this.closing=false;
    this.health=null;this.world=null;this.inspector=null;this.reason='Stopped; explicitly enable the pilot';
    this.nextConnectAt=0;this.lowMemorySamples=0;this.resourceHold=false;this.lastClock=null;
    this.session=randomUUID();this.events=[];this.server=null;this.timers=[];this.pendingSince=0;
  }
  persistControl() { atomicJson(this.controlPath,this.control); }
  event(kind,details={}) {
    const entry={at:new Date().toISOString(),kind,...details};
    this.events.push(entry);this.events=this.events.slice(-60);
    fs.appendFileSync(path.join(this.logs,'events.jsonl'),JSON.stringify(entry)+'\n');
  }
  async start() {
    this.control.enabled=true;this.persistControl();this.reason='Checking the saved world and lab capacity';
    this.event('operator_start');return this.status();
  }
  async stop() {
    this.control.enabled=false;this.persistControl();this.event('operator_stop');
    await this.disconnect('operator_pause');
    try { await this.bridge.world({action:'unload',world:this.options.world}); }
    catch(e) { this.event('world_unload_deferred',{reason:e.message}); }
    this.reason='Stopped; world and unfinished work preserved';return this.status();
  }
  async disconnect(reason) {
    this.generation++;this.ready=false;this.lastClock=null;this.busy=false;this.pendingSince=0;this.nextConnectAt=Date.now()+5000;
    if(this.life) { try {this.life.onDisconnect(reason);}catch(e){this.event('state_error',{reason:e.message});} }
    this.motor?.pause();const old=this.bot;this.bot=null;this.life=null;this.motor=null;
    if(old) old.quit('Persistent pilot: '+reason);
    this.event('connection_interrupted',{reason});
  }
  async inspect() {
    if (!this.bot || !this.ready) return null;
    const state=await this.bridge.world({action:'player',player:this.options.identity,world:this.options.world});
    if(!state.online || state.position?.world_uuid!==this.world.world_uuid || state.player_uuid!==playerUUID(this.bot))
      throw Error('Actual pilot world/player identity no longer matches memory');
    this.inspector=state;return state;
  }
  async connect() {
    if(this.connecting || this.bot || !this.control.enabled || this.closing) return;
    this.connecting=true;
    const requestedGeneration=this.generation;
    const cancelled=()=>!this.control.enabled || this.closing || requestedGeneration!==this.generation;
    try {
      let world=await this.bridge.world({action:'status',world:this.options.world});
      if(cancelled())return;
      if(!world.loaded) world=await this.bridge.world(this.control.world_uuid?
        {action:'load',world:this.options.world}:{action:'create',world:this.options.world,terrain:this.options.fixture?'flat':'normal',seed:20261125});
      if(cancelled()) {
        if(!this.control.enabled)try{await this.bridge.world({action:'unload',world:this.options.world});}catch(e){this.event('world_unload_deferred',{reason:e.message});}
        return;
      }
      if(world.environment!=='NORMAL' || world.keep_inventory!==false || !world.daylight_cycle ||
         (!this.options.fixture && !world.mob_spawning) || !world.auto_save)
        throw Error('Pilot world survival rules did not verify');
      if(this.control.world_uuid && this.control.world_uuid!==world.world_uuid) throw Error('World UUID changed; refusing to rebind the home record');
      this.control.world_uuid=world.world_uuid;this.persistControl();this.world=world;
      await this.bridge.world({action:'admit',player:this.options.identity,world:this.options.world});
      if(cancelled()) return;
      const mineflayer=require('mineflayer');
      const bot=mineflayer.createBot({host:'127.0.0.1',port:this.options.serverPort,username:this.options.identity,auth:'offline',version:'1.21.4',respawn:true});
      const generation=++this.generation;this.bot=bot;
      require('../controller/inventory_sync').attach(bot);
      require('../controller/resource_space').attach(bot);
      require('../controller/enderman_gaze').attach(bot);
      bot.labOxygen=20;
      bot._client.on('entity_metadata',packet=>{bot.labOxygen=require('../controller/air').ownOxygen(packet,bot.entity?.id,bot.labOxygen);});
      const permissions={...require('../config/permissions.json'),attack:true,break_blocks:true,place_blocks:true,inventory:true,server_commands:false};
      const motor=require('../controller/locomotion').createMotor(bot,permissions,{legacy:false});this.motor=motor;
      const doorCare=require('../controller/door_care').createDoorCare(bot);
      let spawnEpoch=0;
      bot.on('physicsTick',()=>{if(generation===this.generation)motor.tick();});
      bot.on('spawn',async()=>{
        if(generation!==this.generation || this.bot!==bot || !this.control.enabled)return;
        const spawnRequest=++spawnEpoch;
        const current=()=>generation===this.generation && this.bot===bot && this.control.enabled && spawnRequest===spawnEpoch && bot.health>0;
        motor.pause();doorCare.reset();this.ready=false;this.lastClock=null;
        try {
          await sleep(800);
          if(!current())return;
          const actual=await this.bridge.world({action:'player',player:this.options.identity,world:this.options.world});
          if(!current())return;
          const uuid=playerUUID(bot);
          if(!actual.online || actual.position?.world_uuid!==world.world_uuid || actual.player_uuid!==uuid || actual.game_mode!=='SURVIVAL') throw Error('Native spawn scope or game mode did not verify');
          if(this.control.player_uuid && this.control.player_uuid!==uuid) throw Error('Player UUID changed');
          this.control.player_uuid=uuid;this.persistControl();
          const worldKey=world.world_uuid+'/'+uuid;
          if(!this.store) {
            this.store=openState(path.join(this.directory,world.world_uuid,this.options.identity+'.json'),{worldKey,identity:this.options.identity});
          }
          if(!this.life) {
            this.store.markSession(this.session+'-'+generation);
            const {PilotLife}=require('./life.cjs');
            const spawn=point(world.spawn),half=Math.min(240,(world.border_size||512)/2-8);
            const bounds=[spawn[0]-half,spawn[0]+half,spawn[2]-half,spawn[2]+half];
            this.life=new PilotLife(bot,motor,this.store,{world,bounds,api:(route,payload)=>this.api(route,payload,generation),scan:require('../controller/perception').scan,tasks:require('../controller/tasks')});
            require('../controller/survival_observations').attach(bot,()=>this.bot===bot&&this.life?this.life.teacher:{});
          }
          // Read back the server's own inventory before trusting cached client
          // slots after a respawn. A stale pre-death window must never supply work.
          const counts=items=>items.reduce((out,i)=>{const key=(i.name||i.item).replace(/^minecraft:/,'');out[key]=(out[key]||0)+i.count;return out;},{});
          const same=(a,b)=>JSON.stringify(Object.entries(counts(a)).sort())===JSON.stringify(Object.entries(counts(b)).sort());
          if(!same(inventory(bot),actual.inventory||[])) {
            await require('../controller/inventory_sync').sync(bot);
            if(!current())return;
            if(!same(inventory(bot),actual.inventory||[])) throw Error('Actual respawn inventory has not synchronized');
          }
          if(!current())return;
          this.life.onRespawn(point(bot.entity.position),inventory(bot));
          this.inspector=actual;this.ready=true;this.reason='Continuing life in the saved world';
          this.event('spawn_verified',{world_uuid:world.world_uuid,player_uuid:uuid,position:point(bot.entity.position),inventory:inventory(bot),native_respawn:actual.respawn});
        } catch(e) {if(!current())return;this.reason=e.message;this.event('spawn_refused',{reason:e.message});await this.disconnect('spawn_verification_failed');}
      });
      bot.on('death',()=>{if(generation!==this.generation)return;spawnEpoch++;this.ready=false;motor.pause();this.lastClock=null;this.life?.onDeath('native_death');this.event('death',{position:bot.entity?point(bot.entity.position):null,inventory:bot.inventory?inventory(bot):[]});});
      bot.on('end',()=>{
        if(generation!==this.generation)return;
        this.life?.onDisconnect('network_disconnect');this.ready=false;this.bot=null;this.life=null;this.motor=null;this.lastClock=null;this.busy=false;
        this.nextConnectAt=Date.now()+5000;this.event('disconnected');
      });
      bot.on('error',e=>this.event('client_error',{reason:e.message}));
      bot.on('kicked',reason=>this.event('kicked',{reason:typeof reason==='string'?reason:JSON.stringify(reason)}));
      this.doorCare=doorCare;this.reason='Connecting to the persistent world';
      this.event('connecting',{world_uuid:world.world_uuid});
    } catch(e) {this.reason=e.message;this.event('connect_deferred',{reason:e.message});if(this.bot)await this.disconnect('connection_setup_failed');this.nextConnectAt=Date.now()+10000;}
    finally {this.connecting=false;}
  }
  async api(route,payload,generation=this.generation) {
    if(generation!==this.generation || !this.bot || !this.control.enabled) throw Error('Pilot action belongs to an interrupted connection');
    if(route==='/step') return {action:payload.teacher,source:'frozen_reference_controller'};
    if(route==='/world/report') {this.lastReport=payload;return {ok:true};}
    if(route==='/world/survival' && payload.action==='home') return this.registerBed(payload.position);
    throw Error('Persistent pilot refuses trial setup or unapproved API: '+route);
  }
  async registerBed(position) {
    const bot=this.bot,generation=this.generation,life=this.life,lifeGeneration=this.life?.generation;
    const current=()=>generation===this.generation && this.bot===bot && this.life===life && life?.generation===lifeGeneration;
    if(!bot || this.world.environment!=='NORMAL') throw Error('No verified NORMAL world for bed interaction');
    const q=new Vec3(...position),bed=bot.blockAt(q);
    if(!bed?.name.endsWith('_bed') || bot.entity.position.distanceTo(q.offset(.5,.5,.5))>4.2 || !bot.canSeeBlock(bed)) throw Error('Bed interaction needs a visible reachable real bed');
    await bot.lookAt(q.offset(.5,.5,.5),true);
    if(!current())throw Error('Bed registration interrupted');
    await bot.activateBlock(bed);
    for(let attempt=0;attempt<8;attempt++) {
      await sleep(200);
      if(!current()) throw Error('Bed registration interrupted');
      const actual=await this.bridge.world({action:'player',player:this.options.identity,world:this.options.world});
      if(!current()) throw Error('Bed registration interrupted');
      const respawn=actual.respawn;
      const source=actual.respawn_block_location;
      if(actual.online && actual.player_uuid===playerUUID(bot) && actual.position?.world_uuid===this.world.world_uuid &&
         actual.respawn_source==='native_bed_event' && actual.respawn_forced===false && actual.respawn_claim_verified===true &&
         actual.respawn_block_is_bed && source?.world_uuid===this.world.world_uuid && respawn?.world_uuid===this.world.world_uuid &&
         Math.hypot(source.x-position[0],source.z-position[2])<=1.6 && Math.abs(source.y-position[1])<1.1) {
        const proof={verified:true,position:[...position],world_uuid:this.world.world_uuid,native_respawn:respawn,native_bed_block:source,forced:false,server_confirmed:true};
        this.event('native_bed_verified',proof);return proof;
      }
    }
    throw Error('Native bed respawn point was not confirmed; no administrative spawnpoint used');
  }
  updateClock(world) {
    if(!this.store || !this.ready || !this.control.enabled || !this.bot || this.bot.health<=0) {this.lastClock=null;return;}
    const tick=world.game_time;
    if(!Number.isSafeInteger(tick)) return;
    const delta=this.lastClock===null?0:tick-this.lastClock;this.lastClock=tick;
    this.store.transact(data=>{
      const demo=data.demo || {target_ticks:7*DAY,active_ticks:0,world_start_tick:tick,world_start_full_time:world.full_time,unobserved_ticks:0,started_at:Date.now()};
      if(delta>0 && delta<=1200) demo.active_ticks+=delta;
      else if(delta>1200) demo.unobserved_ticks+=delta;
      demo.last_game_time=tick;demo.last_full_time=world.full_time;demo.actual_active_days=demo.active_ticks/DAY;
      demo.target_reached=demo.active_ticks>=demo.target_ticks;data.demo=demo;
    });
  }
  async pulse() {
    if(this.closing) return;
    const now=Date.now();
    if(now-this.lastHealthAt>=5000) {
      this.lastHealthAt=now;
      try {
        const h=await this.bridge.health();this.health=h;
        if(h.ram_percent>=89) {
          this.resourceHold=true;this.lowMemorySamples=0;this.reason='Pilot suspended for production memory headroom';
          if(this.bot) await this.disconnect('memory_pressure');
        } else if(this.resourceHold) {
          this.lowMemorySamples=h.ram_percent<=84?this.lowMemorySamples+1:0;
          if(this.lowMemorySamples>=3) {this.resourceHold=false;this.event('memory_recovered');}
        }
        if(h.stopped || !h.server.ready || h.server.busy || !h.server.desired_running) {
          this.reason='Waiting for the existing lab; no automatic production restart';
          if(this.bot) await this.disconnect('lab_unavailable');
        }
      } catch(e) {this.health=null;this.reason='Lab unavailable: '+e.message;if(this.bot) await this.disconnect('lab_unavailable');}
    }
    if(this.control.enabled && !this.resourceHold && this.health?.server.ready && this.health.server.desired_running && !this.health.stopped && !this.health.server.busy && now>=this.nextConnectAt && !this.bot) await this.connect();
    if(this.bot && this.ready && now-this.lastWorldAt>=5000) {
      this.lastWorldAt=now;
      try {
        const world=await this.bridge.world({action:'status',world:this.options.world});
        if(world.world_uuid!==this.control.world_uuid) throw Error('World UUID changed during the continuing life');
        this.world=world;await this.inspect();this.updateClock(world);
      } catch(e) {this.reason=e.message;await this.disconnect('world_verification_failed');}
    }
    if(this.busy && now-this.pendingSince>60000) {this.event('native_action_timeout');await this.disconnect('bounded_native_action_timeout');}
    if(now-this.lastSaveAt>=2000) {this.lastSaveAt=now;atomicJson(path.join(this.directory,'status.json'),this.status());}
  }
  async decision() {
    if(this.busy || !this.ready || !this.life || !this.bot || !this.control.enabled || this.resourceHold) return;
    this.busy=true;this.pendingSince=Date.now();const generation=this.generation;
    try {await this.doorCare.update();if(generation===this.generation)await this.life.tick();}
    catch(e) {this.reason=e.message;this.event('decision_error',{reason:e.message});this.motor?.pause();}
    finally {if(generation===this.generation)this.busy=false;}
  }
  status() {
    const state=this.store?.snapshot(),life=this.life?.status?.() || null;
    return {enabled:this.control.enabled,identity:this.options.identity,world_name:this.options.world,world_uuid:this.control.world_uuid,updated_at_ms:Date.now(),
      connected:!!this.bot&&this.ready,reason:this.reason,resource_hold:this.resourceHold,world:this.world,
      player:this.bot?.entity?{position:point(this.bot.entity.position),health:this.bot.health,food:this.bot.food,inventory:inventory(this.bot),
        uuid:this.control.player_uuid,entity_id:this.bot.entity.id,
        look:[this.bot.entity.yaw,this.bot.entity.pitch].every(Number.isFinite)?[this.bot.entity.yaw,this.bot.entity.pitch]:null,
        speed:Math.hypot(this.bot.entity.velocity?.x||0,this.bot.entity.velocity?.z||0),camera_watch_height:cameraWatchHeight(this.bot,life)}:null,
      life,state:state || null,events:this.events.slice(-20),state_directory:this.directory,
      production:this.health?{ready:this.health.server.ready,bots:this.health.server.bots_online,ram_percent:this.health.ram_percent,phase:this.health.world_learning?.phase}:null};
  }
  listen(port=8100) {
    this.server=http.createServer(async(req,res)=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(!validRequest(req,port)) {res.writeHead(403);res.end('Invalid pilot origin');return;}
      const url=new URL(req.url,'http://127.0.0.1:'+port);
      try {
        if(req.method==='GET' && url.pathname==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'dashboard.html')));return;}
        if(req.method==='GET' && url.pathname==='/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(this.status()));return;}
        if(req.method==='POST' && ['/control/start','/control/stop'].includes(url.pathname)) {
          req.resume();const value=url.pathname.endsWith('/start')?await this.start():await this.stop();
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return;
        }
        if(req.method==='POST' && ['/camera/start','/camera/stop'].includes(url.pathname)) {
          if(this.options.fixture)throw Error('Live viewer controls are unavailable in a fixture');
          const action=url.pathname.endsWith('/start')?'start':'stop',payload=await cameraBody(req);
          // Validate before forwarding; caller never chooses an arbitrary target,
          // command or training control through this loopback viewer interface.
          cameraRequest(action,payload);
          const value=await this.bridge.camera(action,payload);
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return;
        }
        res.writeHead(404);res.end('Unknown pilot control');
      }catch(e){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
    });
    this.server.listen(port,'127.0.0.1');
    let pulsing=false;
    this.timers.push(setInterval(()=>{if(pulsing)return;pulsing=true;this.pulse().catch(e=>this.event('supervisor_error',{reason:e.message})).finally(()=>{pulsing=false;});},500));
    this.timers.push(setInterval(()=>this.decision(),200));return this;
  }
  async close({preserveEnabled=true}={}) {
    this.closing=true;for(const timer of this.timers)clearInterval(timer);
    if(!preserveEnabled){this.control.enabled=false;this.persistControl();}
    await this.disconnect('controller_service_shutdown');this.server?.close();
  }
}

async function main() {
  process.chdir(ROOT);const enabled=process.argv.includes('--enable');
  const directory=path.join(ROOT,'data/persistent-pilot');fs.mkdirSync(directory,{recursive:true});
  const lease=path.join(directory,'supervisor.lock');
  if(fs.existsSync(lease)) {
    const old=JSON.parse(fs.readFileSync(lease,'utf8'));let alive=true;
    try {process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw Error('The persistent pilot supervisor is already running');
    fs.unlinkSync(lease);
  }
  const leaseId=randomUUID();fs.writeFileSync(lease,JSON.stringify({pid:process.pid,id:leaseId}),{flag:'wx'});
  const supervisor=new PilotSupervisor();if(enabled)await supervisor.start();supervisor.listen();
  const quit=async()=>{await supervisor.close();try{if(JSON.parse(fs.readFileSync(lease,'utf8')).id===leaseId)fs.unlinkSync(lease);}catch{}process.exit(0);};
  process.once('SIGINT',quit);process.once('SIGTERM',quit);
  console.log('Persistent pilot controls: http://127.0.0.1:8100 (explicit enablement required on first use)');
}
module.exports={PilotSupervisor,HttpBridge,validateOptions,validRequest,cameraRequest,cameraWatchHeight,atomicJson,inventory,playerUUID,DAY};
if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});

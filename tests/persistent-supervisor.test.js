const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Vec3} = require('vec3');
const {PilotSupervisor, HttpBridge, validateOptions, validRequest, cameraRequest, cameraWatchHeight, playerUUID, DAY} = require('../pilot/index.cjs');

const WORLD = 'pilot-world-uuid', PLAYER = 'ce6d7043-a833-4cdb-badc-e298b097c320';
const nativeWorld = () => ({loaded:true,world:'lab_persistent_pilot',world_uuid:WORLD,environment:'NORMAL',
  keep_inventory:false,daylight_cycle:true,mob_spawning:true,auto_save:true,
  game_time:1000,full_time:1000,spawn:{x:0,y:64,z:0},border_size:512});
const health = (ram=70) => ({ram_percent:ram,stopped:false,
  server:{ready:true,busy:false,desired_running:true,bots_online:8},world_learning:{phase:'baseline'}});
const fakeStore = () => ({data:{}, snapshot(){return structuredClone(this.data);}, transact(fn){fn(this.data);return this.snapshot();}});

function fixture(t, options={}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pilot-supervisor-'));
  const calls=[];
  const bridge=options.bridge || {async health(){calls.push({health:true});return health();},
    async world(payload){calls.push(payload);return nativeWorld();}};
  const supervisor=new PilotSupervisor({...options,bridge,directory:path.join(directory,'state'),logs:path.join(directory,'logs')});
  t.after(async()=>{
    await supervisor.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('mc-pilot-supervisor-'));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  return {supervisor,directory,calls,bridge};
}

test('the initial continuing pilot is disabled and has only its fixed live identity, world and port', t=>{
  const {supervisor:s,calls}=fixture(t);
  assert.equal(s.control.enabled,false);assert.equal(s.options.identity,'HomeAI01');
  assert.equal(s.options.world,'lab_persistent_pilot');assert.equal(s.options.serverPort,25565);
  assert.deepEqual(calls,[]);assert.equal(s.bot,null);assert.equal(s.server,null);
  for(const value of [{identity:'LabAI0'},{world:'world'},{serverPort:25571},{fixture:true},
    {fixture:true,world:'lab_pilot_fixture_case',identity:'HomeAI01',serverPort:25571}]) assert.throws(()=>validateOptions(value));
  assert.equal(validateOptions({fixture:true,world:'lab_pilot_fixture_case',identity:'PilotTest04',serverPort:25571}).fixture,true);
});

test('explicit enablement survives controller restart but control cannot cross world or identity scope', async t=>{
  const {supervisor:s,directory,calls}=fixture(t);
  await s.start();assert.equal(s.control.enabled,true);assert.deepEqual(calls,[]);
  await s.close();
  const restored=new PilotSupervisor({bridge:s.bridge,directory:path.join(directory,'state'),logs:path.join(directory,'logs')});
  assert.equal(restored.control.enabled,true);await restored.close();
  const saved=JSON.parse(fs.readFileSync(s.controlPath));saved.identity='OtherAI01';
  fs.writeFileSync(s.controlPath,JSON.stringify(saved));
  assert.throws(()=>new PilotSupervisor({bridge:s.bridge,directory:path.join(directory,'state'),logs:path.join(directory,'logs')}),/scope/);
});

test('malformed saved control cannot turn a textual false or an unknown schema into enablement', async t=>{
  const {supervisor:s,directory}=fixture(t);
  for(const patch of [{enabled:'false'},{enabled:1},{schema:99}]) {
    fs.writeFileSync(s.controlPath,JSON.stringify({...s.control,...patch}));
    assert.throws(()=>new PilotSupervisor({bridge:s.bridge,directory:path.join(directory,'state'),logs:path.join(directory,'logs')}),/control|schema|enabled|scope/i);
  }
});

test('local viewer origin controls and the HTTP bridge cannot point to a production-external host', ()=>{
  assert.equal(validRequest({headers:{host:'127.0.0.1:8100'}},8100),true);
  assert.equal(validRequest({headers:{host:'localhost:8100',origin:'http://localhost:8100'}},8100),true);
  for(const headers of [{host:'evil.example:8100'},{host:'127.0.0.1:8100',origin:'https://evil.example'},
    {host:'127.0.0.1:8100',origin:'null'}]) assert.equal(validRequest({headers},8100),false);
  for(const base of ['https://127.0.0.1:8000','http://192.168.1.24:8000','http://evil.example']) assert.throws(()=>new HttpBridge(base));
});

test('pilot viewing has one target, validated human viewers and bounded shoulder framing', ()=>{
  assert.deepEqual(cameraRequest('start'),{player:'Xonosnet',target:'HomeAI01',view:'shoulder',distance:3,height:3,cycle_enabled:false,active_only:false,night_vision:true});
  assert.deepEqual(cameraRequest('stop',{player:'xonosnet'}),{player:'xonosnet'});
  assert.equal(cameraRequest('start',{player:'Viewer_2',distance:1,height:12,night_vision:false}).distance,1);
  for(const payload of [{target:'LabAI0'},{command:'stop'},{view:'first_person'},{cycle_enabled:true},
    {player:'HomeAI01'},{player:'LabAI3'},{player:'PilotTest01'},{player:'xonosnet\nstop'},
    {distance:0},{distance:17},{distance:NaN},{distance:'3'},{height:1},{height:13},{height:Infinity},{night_vision:'true'}])
    assert.throws(()=>cameraRequest('start',payload));
  assert.throws(()=>cameraRequest('stop',{player:'Xonosnet',distance:3}));
  for(const payload of [null,[],true,'Xonosnet'])assert.throws(()=>cameraRequest('start',payload));
  assert.throws(()=>cameraRequest('shutdown',{}));
});

test('camera bridge authenticates only the fixed observer operation and explains a pending backend update', async t=>{
  const {directory}=fixture(t), token=path.join(directory,'unit-token');fs.writeFileSync(token,'unit-secret\n');
  const fetch=global.fetch,calls=[];
  try {
    global.fetch=async(url,options)=>{
      calls.push({url,options});assert.equal(url.includes('unit-secret'),false);
      assert.equal(options.headers['X-Lab-Token'],'unit-secret');
      return {ok:true,json:async()=>({enabled:true,target:'HomeAI01'})};
    };
    const bridge=new HttpBridge('http://127.0.0.1:8000',token);
    await bridge.camera('start',{player:'Xonosnet'});await bridge.camera('stop',{player:'Xonosnet'});
    assert.equal(new URL(calls[0].url).pathname,'/observer/start');
    assert.deepEqual(JSON.parse(calls[0].options.body),cameraRequest('start'));
    assert.equal(new URL(calls[1].url).pathname,'/observer/stop');assert.deepEqual(JSON.parse(calls[1].options.body),{player:'Xonosnet'});
    await assert.rejects(bridge.camera('start',{player:'LabAI0'}),/human/);assert.equal(calls.length,2);
    global.fetch=async()=>({ok:false,status:400,text:async()=>'{"detail":"Choose a configured training bot"}'});
    await assert.rejects(bridge.camera('start',{}),/awaiting the dashboard update/);
  } finally {global.fetch=fetch;}
});

test('pilot status supplies live native camera identity and look without changing durable life state', t=>{
  const {supervisor:s}=fixture(t);s.control.player_uuid=PLAYER;s.store=fakeStore();s.ready=true;
  s.bot={quit(){},entity:{id:17,position:new Vec3(1,64,2),yaw:1.5,pitch:-.2,velocity:new Vec3(.03,0,.04)},health:19,food:18,inventory:{items:()=>[]}};
  const before=s.store.snapshot(),status=s.status();
  assert.equal(status.player.uuid,PLAYER);assert.equal(status.player.entity_id,17);
  assert.deepEqual(status.player.look,[1.5,-.2]);assert.equal(status.player.speed,.05);
  assert.ok(Math.abs(Date.now()-status.updated_at_ms)<1000);assert.deepEqual(s.store.snapshot(),before);
  s.bot.entity.yaw=NaN;assert.equal(s.status().player.look,null);
});

test('underground shelter-watch camera reads only the loaded column and finds air above its highest roof', ()=>{
  const calls=[],watch={phase:'night_burrow',activity:'shelter_watch'};
  const bot={entity:{position:new Vec3(-31.5,65,-29.5)},blockAt(point){
    calls.push([point.x,point.y,point.z]);
    return point.y<=68?{name:'dirt',boundingBox:'block'}:{name:'air',boundingBox:'empty'};
  }};
  assert.equal(cameraWatchHeight(bot,watch),5.5);
  assert.equal(calls.length,23);assert.deepEqual(calls[0],[-32,67,-30]);assert.deepEqual(calls.at(-1),[-32,89,-30]);
  calls.length=0;assert.equal(cameraWatchHeight(bot,{phase:'gather',activity:'travel'}),null);assert.equal(calls.length,0);
  assert.equal(cameraWatchHeight(bot,{phase:'night_burrow',activity:'working'}),null);
  bot.blockAt=()=>({name:'air',boundingBox:'empty'});assert.equal(cameraWatchHeight(bot,watch),null);
});

test('underground shelter-watch camera refuses unknown terrain, wet space and roofs without two in-range air blocks', ()=>{
  const watch={phase:'night_burrow',activity:'shelter_watch'},bot={entity:{position:new Vec3(.5,64,.5)}};
  for(const roof of [87,88]) {
    bot.blockAt=point=>({name:point.y===roof?'stone':'air',boundingBox:point.y===roof?'block':'empty'});
    assert.equal(cameraWatchHeight(bot,watch),null);
  }
  bot.blockAt=point=>point.y===80?null:({name:point.y===66?'dirt':'air',boundingBox:point.y===66?'block':'empty'});
  assert.equal(cameraWatchHeight(bot,watch),null);
  bot.blockAt=point=>({name:point.y===66?'dirt':point.y===67?'water':'air',boundingBox:point.y===66?'block':'empty'});
  assert.equal(cameraWatchHeight(bot,watch),null);
  bot.blockAt=()=>{throw Error('Unloaded');};assert.equal(cameraWatchHeight(bot,watch),null);
  bot.entity.position.y=NaN;assert.equal(cameraWatchHeight(bot,watch),null);
});

test('loopback pilot camera routes reject unbounded bodies, invalid origins and target injection before dispatch', async t=>{
  const {once}=require('node:events'),http=require('node:http');
  const {supervisor:s,calls}=fixture(t);s.bridge.camera=async(action,payload)=>{calls.push({camera:action,payload});return {enabled:action==='start'};};
  s.listen(0);await once(s.server,'listening');const port=s.server.address().port;
  t.after(()=>s.server.closeAllConnections());
  const request=(payload,headers={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:'/camera/start',method:'POST',headers:{Host:'127.0.0.1:0','Content-Type':'application/json',...headers}},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });req.on('error',reject);req.end(typeof payload==='string'?payload:JSON.stringify(payload));
  });
  assert.equal((await request({player:'Xonosnet'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await request({player:'Xonosnet',target:'LabAI0'})).status,409);
  assert.equal((await request('x'.repeat(2049))).status,409);assert.equal(calls.length,0);
  assert.equal((await request({player:'Xonosnet'})).status,200);
  assert.deepEqual(calls,[{camera:'start',payload:{player:'Xonosnet'}}]);assert.equal(s.control.enabled,false);
  s.options.fixture=true;assert.equal((await request({player:'Xonosnet'})).status,409);assert.equal(calls.length,1);
});

test('the bridge uses the narrow health endpoint with its required direct localhost authority', async ()=>{
  const fetch=global.fetch;
  try {
    global.fetch=async(url,options={})=>{
      const parsed=new URL(url),headers=options.headers || {};
      assert.equal(parsed.pathname,'/fixture/health');
      assert.equal(parsed.host,'localhost:8000','the real fetch authority must match; a Host override may be ignored');
      assert.equal(headers.Host || headers.host || parsed.host,'localhost:8000');
      return {ok:true,json:async()=>health()};
    };
    assert.equal((await new HttpBridge().health()).server.ready,true);
  } finally {global.fetch=fetch;}
});

test('a real Node fetch reaches a direct-authority health server without relying on a Host override', async t=>{
  const http=require('node:http');let port;
  const server=http.createServer((req,res)=>{
    if(req.headers.host!=='localhost:'+port){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(health()));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  assert.equal((await new HttpBridge('http://127.0.0.1:'+port).health()).server.ready,true);
});

test('the bridge authenticates only managed-world broker calls and never puts its token in a URL', async t=>{
  const {directory}=fixture(t), token=path.join(directory,'unit-token');fs.writeFileSync(token,'unit-secret\n');
  const fetch=global.fetch;
  try {
    global.fetch=async(url,options)=>{
      assert.equal(new URL(url).pathname,'/pilot/world');assert.equal(url.includes('unit-secret'),false);
      assert.equal(options.headers['X-Lab-Token'],'unit-secret');
      assert.deepEqual(JSON.parse(options.body),{action:'status',world:'lab_persistent_pilot'});
      return {ok:true,json:async()=>nativeWorld()};
    };
    assert.equal((await new HttpBridge('http://127.0.0.1:8000',token).world({action:'status',world:'lab_persistent_pilot'})).world_uuid,WORLD);
  } finally {global.fetch=fetch;}
});

test('teacher decisions and reports stay local and production trial or rescue APIs are refused', async t=>{
  const {supervisor:s,calls}=fixture(t);s.control.enabled=true;s.bot={quit(){}};
  assert.deepEqual(await s.api('/step',{teacher:2}),{action:2,source:'frozen_reference_controller'});
  assert.equal((await s.api('/world/report',{phase:'gather'})).ok,true);
  for(const [route,payload] of [['/world/spawn',{}],['/world/resources',{}],['/control/teleport',{}],
    ['/world/survival',{action:'threat'}]]) await assert.rejects(s.api(route,payload),/refuses/);
  await assert.rejects(s.api('/step',{teacher:2},-1),/interrupted/);
  assert.deepEqual(calls,[]);
});

test('player inspection rejects a different actual world or identity', async t=>{
  const {supervisor:s}=fixture(t);s.ready=true;s.world=nativeWorld();s.bot={_client:{uuid:PLAYER},quit(){}};
  for(const patch of [{player_uuid:'other'}, {position:{world_uuid:'other'}}]) {
    s.bridge.world=async()=>({online:true,player_uuid:PLAYER,position:{world_uuid:WORLD},...patch});
    await assert.rejects(s.inspect(),/identity|memory/i);
  }
  s.bridge.world=async()=>({online:true,player_uuid:PLAYER,position:{world_uuid:WORLD}});
  assert.equal((await s.inspect()).player_uuid,PLAYER);
});

test('native player identity comes from Mineflayer client or entity UUID rather than an absent bot.uuid', ()=>{
  assert.equal(playerUUID({_client:{uuid:PLAYER.toUpperCase()}}),PLAYER);
  assert.equal(playerUUID({entity:{uuid:PLAYER}}),PLAYER);
  assert.equal(playerUUID({_client:{uuid:PLAYER},uuid:'untrusted-top-level'}),PLAYER);
  for(const bot of [{uuid:PLAYER},{username:'HomeAI01'}, {_client:{uuid:'HomeAI01'}},
    {_client:{uuid:'not-a-native-uuid'},entity:{uuid:PLAYER}}, {}]) {
    assert.throws(()=>playerUUID(bot),/Native player UUID is unavailable/);
  }
});

function bedBot() {
  const actions=[];
  return {_client:{uuid:PLAYER},entity:{position:new Vec3(.5,64,.5)},health:20,
    blockAt(){return {name:'white_bed'};},canSeeBlock(){return true;},
    async lookAt(){actions.push('look');},async activateBlock(){actions.push('activate');},quit(){},actions};
}
function bedProof(patch={}) {
  return {online:true,player_uuid:PLAYER,position:{world_uuid:WORLD},respawn_block_is_bed:true,
    respawn_source:'native_bed_event',respawn_forced:false,respawn_claim_verified:true,
    respawn_block_location:{world_uuid:WORLD,x:0,y:64,z:0},
    respawn:{world_uuid:WORLD,x:0,y:64,z:1},...patch};
}

test('bed registration requires real reach/sight and native confirmation without administrative spawnpoint commands', async t=>{
  const {supervisor:s}=fixture(t);s.bot=bedBot();s.world=nativeWorld();
  const requests=[];s.bridge.world=async p=>{requests.push(p);return bedProof();};
  const proof=await s.registerBed([0,64,0]);
  assert.equal(proof.server_confirmed,true);assert.equal(proof.world_uuid,WORLD);
  assert.deepEqual(s.bot.actions,['look','activate']);
  assert.deepEqual(requests,[{action:'player',player:'HomeAI01',world:'lab_persistent_pilot'}]);
  s.bot.canSeeBlock=()=>false;await assert.rejects(s.registerBed([0,64,0]),/visible|reachable/);
  s.bot.canSeeBlock=()=>true;s.bot.entity.position=new Vec3(100,64,100);
  await assert.rejects(s.registerBed([0,64,0]),/visible|reachable/);
  s.world.environment='NETHER';await assert.rejects(s.registerBed([0,64,0]),/NORMAL/);
  assert.equal(requests.length,1);
});

test('a bed acknowledgement cannot belong to another player or another actual current world', async t=>{
  const {supervisor:s}=fixture(t);s.bot=bedBot();s.world=nativeWorld();
  for(const patch of [{player_uuid:'wrong-player'},{position:{world_uuid:'wrong-current-world'}}]) {
    s.bridge.world=async()=>bedProof(patch);
    await assert.rejects(s.registerBed([0,64,0]),/identity|scope|world|confirmed/i);
  }
});

test('bed presence without a confirmed matching native respawn point remains unverified', async t=>{
  const {supervisor:s}=fixture(t);s.bot=bedBot();s.world=nativeWorld();
  s.bridge.world=async()=>bedProof({respawn:{world_uuid:'wrong-world',x:0,y:64,z:1}});
  await assert.rejects(s.registerBed([0,64,0]),/not confirmed/);
});

test('bed proof requires an unforced native event and a verified real bed claim, not merely safe adjacent air', async t=>{
  const {supervisor:s}=fixture(t);s.bot=bedBot();s.world=nativeWorld();
  // Bukkit may choose safe adjacent air farther than the raw foot/head block.
  s.bridge.world=async()=>bedProof({respawn:{world_uuid:WORLD,x:2.5,y:64,z:2.5}});
  const proof=await s.registerBed([0,64,0]);
  assert.equal(proof.server_confirmed,true);assert.deepEqual(proof.native_bed_block,{world_uuid:WORLD,x:0,y:64,z:0});
  const invalid=[{respawn_source:'unknown'},{respawn_source:'plugin_spawnpoint'},
    {respawn_forced:true},{respawn_claim_verified:false},{respawn_block_is_bed:false},
    {respawn_block_location:{world_uuid:WORLD,x:8,y:64,z:8}},
    {respawn_block_location:{world_uuid:'wrong-world',x:0,y:64,z:0}}];
  const original=setTimeout;
  try {
    global.setTimeout=(fn,ms,...args)=>original(fn,0,...args);
    for(const patch of invalid) {
      s.bridge.world=async()=>bedProof(patch);
      await assert.rejects(s.registerBed([0,64,0]),/not confirmed/);
    }
  } finally {global.setTimeout=original;}
});

test('seven-day accounting uses observed simulation ticks and excludes death, disconnects and large unobserved gaps', async t=>{
  const {supervisor:s}=fixture(t);s.control.enabled=true;s.ready=true;s.bot={health:20,quit(){}};s.store=fakeStore();
  s.updateClock({game_time:100,full_time:100});s.updateClock({game_time:200,full_time:1000000});
  assert.equal(s.store.data.demo.active_ticks,100);
  s.updateClock({game_time:200,full_time:2000000});assert.equal(s.store.data.demo.active_ticks,100);
  s.updateClock({game_time:5000,full_time:2000000});assert.equal(s.store.data.demo.unobserved_ticks,4800);
  assert.equal(s.store.data.demo.active_ticks,100);
  s.bot.health=0;s.updateClock({game_time:5100,full_time:2000100});assert.equal(s.lastClock,null);
  s.bot.health=20;s.updateClock({game_time:5200,full_time:2000200});assert.equal(s.store.data.demo.active_ticks,100);
  await s.disconnect('test_disconnect');s.bot={health:20,quit(){}};s.ready=true;
  s.updateClock({game_time:100000,full_time:100000});assert.equal(s.store.data.demo.active_ticks,100);
  for(let n=1;n<=168;n++) s.updateClock({game_time:100000+n*1000,full_time:100000+n*1000});
  assert.equal(s.store.data.demo.target_reached,true);
  assert.equal(s.store.data.demo.active_ticks,7*DAY+100);
});

test('a world UUID change during a pulse disconnects rather than rebinding the home or counting days', async t=>{
  const {supervisor:s}=fixture(t);s.control.enabled=true;s.control.world_uuid=WORLD;s.world=nativeWorld();
  s.ready=true;s.bot={health:20,quit(){}};s.store=fakeStore();
  s.lastHealthAt=Date.now();s.bridge.world=async()=>({...nativeWorld(),world_uuid:'changed-world'});
  await s.pulse();assert.equal(s.ready,false);assert.equal(s.bot,null);assert.equal(s.control.world_uuid,WORLD);
  assert.equal(s.store.data.demo,undefined);
});

test('memory pause disconnects once and needs three low samples before a permitted reconnect', async t=>{
  const {supervisor:s}=fixture(t);const original=Date.now;let now=10000,ram=89,attempts=0,quits=0;
  try {
    Date.now=()=>now;s.control.enabled=true;s.ready=true;s.bot={health:20,quit(){quits++;}};
    s.life={onDisconnect(){},status(){return {};}};s.motor={pause(){}};
    s.bridge.health=async()=>health(ram);s.connect=async()=>{attempts++;};
    await s.pulse();assert.equal(s.resourceHold,true);assert.equal(quits,1);assert.equal(attempts,0);
    for(const next of [84,84,85,84,84]) {now+=5000;ram=next;await s.pulse();}
    assert.equal(s.resourceHold,true);assert.equal(attempts,0);assert.equal(quits,1);
    now+=5000;ram=84;await s.pulse();assert.equal(s.resourceHold,false);assert.equal(attempts,1);
    s.control.enabled=false;now+=10000;await s.pulse();assert.equal(attempts,1);
  } finally {Date.now=original;}
});

test('an intentional lab shutdown never causes production restart or pilot reconnect', async t=>{
  const {supervisor:s,calls}=fixture(t);s.control.enabled=true;s.ready=true;s.bot={health:20,quit(){}};
  s.bridge.health=async()=>({...health(),stopped:true});let attempts=0;s.connect=async()=>{attempts++;};
  await s.pulse();assert.equal(s.bot,null);assert.equal(attempts,0);
  assert.deepEqual(calls,[]);assert.match(s.reason,/Waiting for the existing lab/);
});

test('stopping during a pending status probe prevents any later create or admission', async t=>{
  let completeStatus;const calls=[];
  const bridge={async health(){return health();},async world(payload){
    calls.push(payload);
    if(payload.action==='status') return new Promise(resolve=>{completeStatus=resolve;});
    return nativeWorld();
  }};
  const {supervisor:s}=fixture(t,{bridge});await s.start();
  const connecting=s.connect();assert.ok(completeStatus);
  await s.stop();completeStatus({loaded:false});await connecting;
  assert.deepEqual(calls.map(p=>p.action),['status','unload']);assert.equal(s.control.enabled,false);assert.equal(s.bot,null);
});

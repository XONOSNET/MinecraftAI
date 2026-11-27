'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Vec3}=require('vec3'),native=require('../pilot/neutral_spiders.cjs');

function fixture(){
  const bot=new EventEmitter(),now={value:1000};
  Object.assign(bot,{version:'1.21.4',registry:require('minecraft-data')('1.21.4'),_client:new EventEmitter(),
    entities:{},entity:{position:new Vec3(0,65,0)},time:{timeOfDay:6000},isRaining:false,rainState:0,thunderState:0,
    blockAt:position=>({name:'air',boundingBox:'empty',position}),world:{getSkyLight:()=>15}});
  const api=native.attach(bot,{clock:()=>now.value});
  const entity={id:42,name:'spider',uuid:'04a7e37e-43c6-415a-bfdc-ad530fcbeee1',position:new Vec3(9,67,0),metadata:[],isValid:true};
  bot.entities[42]=entity;
  const standing=new Vec3(0,67,0);
  const spawn=()=>bot.emit('entitySpawn',entity);
  const check=()=>native.assess(bot,entity,standing);
  return {bot,entity,now,standing,api,spawn,check};
}

test('a known neutral native spawn is eligible only after settling, without altering entities',()=>{
  const f=fixture();assert.equal(f.check().reason,'untracked');f.spawn();
  assert.equal(f.check().reason,'spawn_settling');f.now.value+=500;
  assert.equal(f.check().neutral,true);assert.equal(f.check().flags_source,'native_spawn_default');
  assert.equal(f.bot.labPersistentNeutralSpider(f.entity,f.standing),true);
  assert.strictEqual(f.bot.entities[42],f.entity);assert.equal(f.entity.metadata[15],undefined);
  assert.equal(f.api.report(f.standing)[0].entity_id,42);
});

test('native aggression and weather are re-read on every guard check',()=>{
  const f=fixture();f.spawn();f.now.value+=500;
  assert.equal(f.check().neutral,true);
  f.entity.metadata[15]=4;assert.equal(f.check().reason,'aggressive');
  f.entity.metadata[15]=0;assert.equal(f.check().neutral,true);
  f.bot.thunderState=.1;assert.equal(f.check().reason,'weather_not_clear');
  f.bot.thunderState=0;f.bot.rainState=.1;assert.equal(f.check().reason,'weather_not_clear');
  f.bot.rainState=0;f.bot.isRaining=true;assert.equal(f.check().reason,'weather_not_clear');
  f.bot.isRaining=false;f.bot.time.timeOfDay=10001;assert.equal(f.check().reason,'outside_bright_day_window');
  f.bot.time.timeOfDay=6000;assert.equal(f.check().neutral,true);
  delete f.entity.metadata[15];assert.equal(f.check().reason,'metadata_lost');
});

for(const [name,change,reason] of [
  ['cave spider',f=>{f.entity.name='cave_spider';},'not_normal_spider'],
  ['unsupported client version',f=>{f.bot.version='1.21.5';},'unsupported_schema'],
  ['registry mismatch',f=>{f.bot.registry={entitiesByName:{spider:{name:'spider',metadataKeys:[]}}};},'unsupported_schema'],
  ['missing weather',f=>{delete f.bot.rainState;},'weather_not_clear'],
  ['missing time',f=>{f.bot.time.timeOfDay=null;},'outside_bright_day_window'],
  ['night',f=>{f.bot.time.timeOfDay=18000;},'outside_bright_day_window'],
  ['dawn',f=>{f.bot.time.timeOfDay=1000;},'outside_bright_day_window'],
  ['missing actual position',f=>{f.bot.entity.position=null;},'unknown_position'],
  ['close to bot',f=>{f.entity.position=new Vec3(4,65,0);},'too_close'],
  ['close to proposed exit',f=>{f.standing.set(8,67,0);},'too_close'],
  ['unloaded terrain',f=>{f.bot.blockAt=()=>null;},'body_not_loaded_air'],
  ['solid at body',f=>{f.bot.blockAt=()=>({name:'stone',boundingBox:'block'});},'body_not_loaded_air'],
  ['water at body',f=>{f.bot.blockAt=()=>({name:'water',boundingBox:'empty'});},'body_not_loaded_air'],
  ['dim sky',f=>{f.bot.world.getSkyLight=()=>11;},'not_bright_exposed_terrain'],
  ['unknown light',f=>{f.bot.world.getSkyLight=()=>undefined;},'not_bright_exposed_terrain'],
  ['unavailable light reader',f=>{delete f.bot.world.getSkyLight;},'light_unavailable'],
  ['throwing light reader',f=>{f.bot.world.getSkyLight=()=>{throw Error('not loaded');};},'light_unavailable'],
  ['noninteger flags',f=>{f.entity.metadata[15]='0';},'unknown_mob_flags'],
  ['unknown flag bits',f=>{f.entity.metadata[15]=8;},'unknown_mob_flags'],
  ['invalidated entity',f=>{f.entity.isValid=false;},'untracked'],
  ['changed UUID',f=>{f.entity.uuid='1823b71b-3bad-44ba-bc07-9d2bde012d00';},'untracked'],
  ['reused native entity ID',f=>{f.bot.entities[42]={...f.entity};},'untracked']
])test(name+' cannot relax the threat guard',()=>{
  const f=fixture();f.spawn();f.now.value+=500;change(f);
  assert.equal(f.check().neutral,false);assert.equal(f.check().reason,reason);
});

test('joining after an entity exists does not invent a native spawn observation',()=>{
  const f=fixture();f.now.value+=10000;
  assert.equal(f.check().reason,'untracked');
  assert.strictEqual(native.attach(f.bot),f.api);
  assert.equal(f.bot.listenerCount('entitySpawn'),1);
});

test('native destruction, dimension respawn and disconnect invalidate spawn claims',()=>{
  const f=fixture();f.spawn();f.now.value+=500;assert.equal(f.check().neutral,true);
  f.bot.emit('entityGone',f.entity);assert.equal(f.check().reason,'untracked');
  f.spawn();f.now.value+=500;assert.equal(f.check().neutral,true);
  f.bot._client.emit('respawn',{});assert.equal(f.check().reason,'untracked');
  f.spawn();f.now.value+=500;f.bot.emit('end');assert.equal(f.check().reason,'untracked');
});

test('invalid initial UUID never acquires a trusted protocol default',()=>{
  const f=fixture();f.entity.uuid='not-a-native-uuid';f.spawn();f.now.value+=500;
  assert.equal(f.check().reason,'untracked');
});

test('bright-window boundaries and exposed-threat clearance are conservative and explicit',()=>{
  const f=fixture();f.spawn();f.now.value+=500;
  for(const time of [2000,4000,6000,8000,10000]){f.bot.time.timeOfDay=time;assert.equal(f.check().neutral,true);}
  f.entity.position=new Vec3(4.5,67,0);assert.equal(f.check().neutral,true);
  f.entity.position=new Vec3(4.49,67,0);assert.equal(f.check().reason,'too_close');
  f.entity.position=new Vec3(9,67,0);f.now.value=999;assert.equal(f.check().reason,'spawn_settling');
});

test('bright partial shade is measured in both loaded body cells, not guessed from daylight',()=>{
  const f=fixture();f.spawn();f.now.value+=500;
  for(const light of [12,13,14,15]){f.bot.world.getSkyLight=()=>light;assert.equal(f.check().neutral,true);}
  f.entity.position.y=67.3;
  f.bot.world.getSkyLight=q=>q.y===67?13:11;
  assert.equal(f.check().neutral,false);
});

test('a native ceiling contact is not mistaken for a solid block inside the spider',()=>{
  const f=fixture();f.spawn();f.now.value+=500;f.entity.position.y=71.10000002384186;
  f.bot.blockAt=q=>({name:q.y===72?'oak_log':'air',boundingBox:q.y===72?'block':'empty'});
  f.bot.world.getSkyLight=()=>13;
  assert.equal(f.check().neutral,true);
  f.entity.position.y=71.3;
  assert.equal(f.check().reason,'body_not_loaded_air','actual body overlap still refuses the exception');
});

test('dry noncolliding grass is valid native body space but wet and hazardous cells are not',()=>{
  const f=fixture();f.spawn();f.now.value+=500;
  f.bot.blockAt=()=>({name:'short_grass',boundingBox:'empty'});f.bot.world.getSkyLight=()=>13;
  assert.equal(f.check().calm,true);
  for(const name of ['water','bubble_column','fire','cobweb']){
    f.bot.blockAt=()=>({name,boundingBox:'empty'});assert.equal(f.check().calm,false);
  }
  f.bot.blockAt=()=>({name:'unknown_block',boundingBox:'empty'});assert.equal(f.check().calm,false);
});

test('known calm proximity does not imply hostility or permit opening a refuge',()=>{
  const f=fixture();f.spawn();f.now.value+=500;f.entity.position=new Vec3(3,65,0);
  const value=f.check();
  assert.equal(value.calm,true);assert.equal(value.neutral,false);assert.equal(value.reason,'too_close');
  assert.equal(f.bot.labPersistentCalmSpider(f.entity),true);
  assert.equal(f.bot.labPersistentNeutralSpider(f.entity,f.standing),false);
  f.entity.metadata[15]=4;
  assert.equal(f.check().calm,false);assert.equal(f.check().neutral,false);assert.equal(f.check().reason,'aggressive');
  assert.equal(f.bot.labPersistentCalmSpider(f.entity),false);
});

test('exit clearance from a proposed stance is separate from verified calm disposition',()=>{
  const f=fixture();f.spawn();f.now.value+=500;f.standing.set(8,67,0);
  assert.equal(f.check().calm,true);assert.equal(f.check().neutral,false);assert.equal(f.check().reason,'too_close');
  f.standing.set(0,67,0);
  assert.equal(f.check().calm,true);assert.equal(f.check().neutral,true);
});

for(const [name,change] of [
  ['night',f=>{f.bot.time.timeOfDay=18000;}],
  ['shade',f=>{f.bot.world.getSkyLight=()=>11;}],
  ['unknown light',f=>{f.bot.world.getSkyLight=()=>undefined;}],
  ['unknown body',f=>{f.bot.blockAt=()=>null;}],
  ['rain',f=>{f.bot.isRaining=true;}],
  ['aggression',f=>{f.entity.metadata[15]=4;}],
  ['untracked native identity',f=>{f.entity.uuid='9f66ffbc-6e80-4a0f-88df-f76a5e946bc8';}],
])test('a close spider with '+name+' has neither a calm nor an exit exception',()=>{
  const f=fixture();f.spawn();f.now.value+=500;f.entity.position=new Vec3(3,65,0);change(f);
  const value=f.check();assert.equal(value.calm,false);assert.equal(value.neutral,false);
  assert.equal(f.bot.labPersistentCalmSpider(f.entity),false);
  assert.equal(f.bot.labPersistentNeutralSpider(f.entity,f.standing),false);
});

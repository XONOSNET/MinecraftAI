'use strict';

// Presentation and native observation only. This opt-in supplies a narrow
// classification to the resident's existing guards; it does not hide entities,
// move the bot, open a roof, choose a route, or change the world's mechanics.
const {Vec3}=require('vec3');
const VERSION='1.21.4',FLAGS_INDEX=15,AGGRESSIVE=4,SETTLE_MS=500;
const HAZARDS=new Set(['water','lava','bubble_column','fire','soul_fire','powder_snow','cobweb','sweet_berry_bush']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const attached=new WeakMap();
const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const validUuid=value=>typeof value==='string'&&UUID.test(value)&&value.replace(/-/g,'')!=='0'.repeat(32);

function schema(bot){
  const data=bot.registry?.entitiesByName?.spider;
  return bot.version===VERSION&&data?.name==='spider'&&data.metadataKeys?.[FLAGS_INDEX]==='mob_flags';
}

function attach(bot,{clock=Date.now}={}){
  if(attached.has(bot))return attached.get(bot).api;
  if(!bot||typeof bot.on!=='function'||typeof clock!=='function')throw Error('Neutral spider observation needs a native client');
  const state={clock,records:new Map(),api:null};
  const spawn=e=>{
    if(!schema(bot)||e?.name!=='spider'||!Number.isInteger(e.id)||bot.entities?.[e.id]!==e||!validUuid(e.uuid))return;
    // Mojang's 1.21.4 Mob defaults this synchronized byte to zero. Initial
    // ServerEntity pairing sends only nondefault values, so absence at this
    // actual spawn is a known protocol default, not a fabricated AI state.
    state.records.set(e.id,{entity:e,uuid:e.uuid.toLowerCase(),spawnAt:clock(),sawFlags:Object.hasOwn(e.metadata||{},FLAGS_INDEX)});
  };
  const gone=e=>{if(state.records.get(e?.id)?.entity===e)state.records.delete(e.id);};
  const reset=()=>state.records.clear();
  bot.on('entitySpawn',spawn);bot.on('entityGone',gone);bot.on('end',reset);
  bot._client?.on?.('respawn',reset);
  const api={assess:(e,standing)=>assess(bot,e,standing),report:standing=>report(bot,standing)};
  state.api=api;attached.set(bot,state);
  bot.labPersistentNeutralSpider=(e,standing)=>assess(bot,e,standing).neutral;
  // Disposition and exit clearance are different questions. A verified calm
  // spider near the resident must not become a combat target merely because
  // it is too close for opening a sealed refuge safely.
  bot.labPersistentCalmSpider=e=>assess(bot,e).calm;
  return api;
}

function assess(bot,e,standing=bot.entity?.position){
  const result={calm:false,neutral:false,reason:'untracked',entity_id:e?.id,name:e?.name};
  const refuse=reason=>({...result,reason});
  const state=attached.get(bot);
  if(!state)return result;
  if(e?.name!=='spider')return refuse('not_normal_spider');
  if(!schema(bot))return refuse('unsupported_schema');
  const tracked=state.records.get(e.id);
  if(!tracked||tracked.entity!==e||bot.entities?.[e.id]!==e||e.isValid===false||!validUuid(e.uuid)||e.uuid.toLowerCase()!==tracked.uuid)return refuse('untracked');
  const age=state.clock()-tracked.spawnAt;result.observed_ms=age;
  if(!Number.isFinite(age)||age<SETTLE_MS)return refuse('spawn_settling');
  const flagsPresent=Object.hasOwn(e.metadata||{},FLAGS_INDEX),flags=flagsPresent?e.metadata[FLAGS_INDEX]:0;
  if(flagsPresent)tracked.sawFlags=true;
  else if(tracked.sawFlags)return refuse('metadata_lost');
  result.mob_flags=flags;result.flags_source=flagsPresent?'native_metadata':'native_spawn_default';
  if(!Number.isInteger(flags)||flags<0||flags>7)return refuse('unknown_mob_flags');
  if(flags&AGGRESSIVE)return refuse('aggressive');
  const time=bot.time?.timeOfDay;result.time_of_day=time;
  if(!Number.isFinite(time)||time<2000||time>10000)return refuse('outside_bright_day_window');
  result.weather={raining:bot.isRaining,rain:bot.rainState,thunder:bot.thunderState};
  if(bot.isRaining!==false||bot.rainState!==0||bot.thunderState!==0)return refuse('weather_not_clear');
  if(!finitePoint(e.position)||!finitePoint(standing)||!finitePoint(bot.entity?.position))return refuse('unknown_position');
  result.distance=distance(e.position,bot.entity.position);result.exit_distance=distance(e.position,standing);
  if(typeof bot.blockAt!=='function'||typeof bot.world?.getSkyLight!=='function')return refuse('light_unavailable');
  // Both body cells must be loaded, empty and receive bright daylight. The
  // clear central-day window makes skyDarken zero in NORMAL (native 1.21.4
  // sun-angle/sky-darkening formula clamps to zero throughout 2000–10000).
  // We intentionally do not infer brightness from an unloaded chunk's zeroes.
  // Sample inside the native 0.9-high body, not exactly on its top face.
  // A wall-clinging spider at y=71.100000024 can touch a ceiling at 72;
  // adding 0.9 would misclassify that solid boundary as its occupied cell.
  const cells=[new Vec3(e.position.x,e.position.y+.05,e.position.z).floored(),
               new Vec3(e.position.x,e.position.y+.85,e.position.z).floored()];
  result.sky_light=[];
  try{
    for(const q of cells){
      const block=bot.blockAt(q);
      if(!block||!bot.registry.blocksByName?.[block.name]||HAZARDS.has(block.name)||block.boundingBox!=='empty'||block.getProperties?.().waterlogged)return refuse('body_not_loaded_air');
      const light=bot.world.getSkyLight(q);result.sky_light.push(light);
      if(!Number.isInteger(light)||light<12||light>15)return refuse('not_bright_exposed_terrain');
    }
  }catch{return refuse('light_unavailable');}
  // Only the complete, current native identity/flags/daylight/body evidence
  // establishes calm disposition. Proximity still vetoes the exit exception.
  result.calm=true;
  if(result.distance<4.5||result.exit_distance<4.5)return refuse('too_close');
  return {...result,neutral:true,reason:'observed_calm_spider_in_bright_daylight'};
}

function report(bot,standing=bot.entity?.position){
  return Object.values(bot.entities||{}).filter(e=>['spider','cave_spider'].includes(e.name)&&finitePoint(e.position)&&
    finitePoint(bot.entity?.position)&&distance(e.position,bot.entity.position)<24)
    .sort((a,b)=>distance(a.position,bot.entity.position)-distance(b.position,bot.entity.position))
    .slice(0,16).map(e=>assess(bot,e,standing));
}

module.exports={attach,assess,report,VERSION,FLAGS_INDEX,SETTLE_MS};

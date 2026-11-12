const combat=require('./combat');
const data=t=>t.wilderness.observations??={productive_ms:0,idle_ms:0,travel_ms:0,nights_started:0,nights_survived:0,damage:{}};
function tick(t,b,now=Date.now()){
 if(!t.wilderness||['survey','complete','stopped'].includes(t.phase))return;
 const d=data(t),time=b.time?.timeOfDay,night=Number.isFinite(time)?time>=13000&&time<23000:null;
 if(night===null)return;
 const day=time<12000;
 if(night&&!d.nightOpen){d.nightOpen=true;d.nights_started++;}
 if(day&&d.nightOpen&&b.health>0){d.nightOpen=false;d.nights_survived++;}
 if(d.lastNight&&d.lastAt!=null)d[d.activity||'idle_ms']+=Math.max(0,Math.min(30000,now-d.lastAt));
 d.lastAt=now;d.lastNight=night;
}
function activity(t){
 if(!t.wilderness||['survey','complete','stopped'].includes(t.phase))return;
 const message=t.message||'',burrow=t.wilderness.burrow;
 data(t).activity=/Protected work:|Lighting|Excavating|digging one|Installing|Mining exposed|Defending against|Cooking/.test(message)||
  /^(floor|table|build|craft|stone_tools|furnace|smelt|torch_craft)$/.test(t.phase)||
  t.wilderness.mine?.stage==='dig'&&['night_iron','night_stone'].includes(t.phase)?'productive_ms':
  t.navigationActive||/retreat|returning/i.test(message)?'travel_ms':'idle_ms';
}
function attach(bot,get){
 let health=20;
 bot.on('spawn',()=>{health=bot.health??20;});
 bot.on('entityHurt',(entity,source)=>{
  const t=get();if(!t.wilderness||entity?.id!==bot.entity?.id||['complete','stopped'].includes(t.phase))return;
  data(t).lastDamage={source:source?.name||'unknown',at:Date.now()};
 });
 bot.on('health',()=>{
  const t=get(),next=bot.health,loss=health-next;health=next;
  if(!(loss>0)||!t.wilderness||['complete','stopped'].includes(t.phase))return;
  const d=data(t),hit=d.lastDamage,kind=hit&&Date.now()-hit.at<800?hit.source:'unknown';
  d.damage[kind]=(d.damage[kind]||0)+loss;
  if(loss>=4)t.wilderness.memory.encounter(kind,'damage',bot.entity.position);
 });
 bot.on('entityDead',e=>{
  const t=get(),r=t.wilderness?.defense;
  if(!r?.task||r.target_id!==e.id)return;
  const before=r.kills||0;combat.death(e,r.task,r);
  if(r.kills>before){
   t.wilderness.memory.encounter(e.name,'defeated',bot.entity.position);r.target_id=null;bot.deactivateItem?.();
  }
 });
}
function died(t,b){
 if(!t.wilderness)return;
 const d=data(t);if(d.death)return;
 const hit=d.lastDamage,source=hit&&Date.now()-hit.at<1500?hit.source:'unknown';
 d.death={source,phase:t.phase,night:!!d.nightOpen};
 t.wilderness.memory.encounter(source,'death',b.entity.position);
}
function report(t){
 const d=t.wilderness.observations||{},r=t.wilderness.defense;
 return {night:{started:d.nights_started||0,survived:d.nights_survived||0,
  productive_seconds:Math.round((d.productive_ms||0)/1000),idle_seconds:Math.round((d.idle_ms||0)/1000),
  travel_seconds:Math.round((d.travel_ms||0)/1000)},
  combat:{engagements:r?.engagements||0,defeated:r?.kills||0,retreats:r?.retreats||0,retreat_reason:r?.retreatReason||null,damage:d.damage||{}},
  death:d.death||null};
}
module.exports={attach,tick,activity,died,report};

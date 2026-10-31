const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const sleep=require('../controller/night_sleep'),night=require('../controller/first_night'),house=require('../controller/house');
function fixture(){
 const t={phase:'night_hold',plot:{x:0,y:64,z:0},milestones:['hut'],started:Date.now()-20000,lastProgress:0,milestone(name){this.milestones.push(name);}};
 night.init(t,{});
 const blocks=new Map(house.blueprint(t.plot).map(p=>[`${p.x},${p.y},${p.z}`,p.table?'crafting_table':'oak_planks']));
 const bed=house.point(t.plot,'bed');blocks.set(bed.toArray().join(','),'white_bed');blocks.set(bed.offset(0,0,1).toArray().join(','),'white_bed');blocks.set('0,64,-3','oak_door');
 const b={health:20,food:20,time:{timeOfDay:14000},game:{dimension:'overworld'},entity:{position:new Vec3(.5,64.1,.5)},entities:{},inventory:{items:()=>[{name:'cooked_beef',count:4}]},
  blockAt(p){return {name:blocks.get(p.toArray().join(','))||'air',position:p,getProperties:()=>({open:false,occupied:false})};},
  async sleep(){this.isSleeping=true;},async wake(){this.isSleeping=false;}};
 return {t,b,motor:{pause(){}},blocks};
}
test('daylight waits in shelter without clicking bed or fabricating a night',async()=>{
 const {t,b,motor}=fixture();b.time.timeOfDay=6000;b.sleep=()=>assert.fail('day sleep');
 assert.match(await sleep.tick(t,b,motor),/waiting for night/);assert.equal(t.wilderness.sleep.morning_seen,false);
});
test('bed use requires server-confirmed sleep and then a subsequent morning',async()=>{
 const {t,b,motor}=fixture();
 assert.match(await sleep.tick(t,b,motor),/Sleeping/);assert.equal(t.wilderness.sleep.morning_seen,false);
 b.isSleeping=false;b.time.timeOfDay=17000;assert.equal(sleep.observe(t,b).morning_seen,false);
 b.time.timeOfDay=0;assert.match(await sleep.tick(t,b,motor),/Morning verified/);assert.equal(t.wilderness.sleep.morning_seen,true);
});
test('sleep rejection is reported, throttled and retried while safely sheltered',async()=>{
 const {t,b,motor}=fixture();let calls=0;b.sleep=async()=>{calls++;throw Error('monsters nearby');};
 assert.match(await sleep.tick(t,b,motor,null,100),/monsters nearby/);
 await sleep.tick(t,b,motor,null,5000);assert.equal(calls,1);await sleep.tick(t,b,motor,null,10100);assert.equal(calls,2);
 assert.equal(t.phase,'night_hold');assert.equal(t.wilderness.sleep.morning_seen,false);
});
test('an unconfirmed bed interaction cannot claim the bot is sleeping',async()=>{
 const {t,b,motor}=fixture();b.sleep=async()=>{};
 assert.match(await sleep.tick(t,b,motor),/not confirmed sleeping/);
 assert.equal(t.wilderness.sleep.morning_seen,false);
});
test('missing and occupied beds never credit sleeping, unsafe dimensions never activate beds',async()=>{
 for(const kind of ['missing','occupied','dimension']){
  const {t,b,motor}=fixture();b.sleep=()=>assert.fail(kind);
  if(kind==='missing')b.blockAt=()=>null;
  if(kind==='occupied'){const at=b.blockAt;b.blockAt=p=>({...at(p),getProperties:()=>({occupied:true})});}
  if(kind==='dimension')b.game.dimension='the_nether';
  assert.match(await sleep.tick(t,b,motor),/missing|occupied|unsafe/);
 }
});
test('own bedside approach is used and blocked routes are reported without teleporting',async()=>{
 const {t,b,motor}=fixture();b.entity.position=new Vec3(-1.5,64.1,-1.5);let target;
 assert.match(await sleep.tick(t,b,motor,async goal=>{target=goal;return false;}),/approach is blocked/);
 assert.deepEqual(target,[1.5,64.1,.5]);
});
test('sleeping pauses food work until waking is acknowledged',async()=>{
 const {t,b,motor}=fixture();b.isSleeping=true;b.food=12;let wakes=0;
 b.wake=async()=>{wakes++;};
 assert.equal(await night.interrupt(t,b,motor,{world:{}}),true);
 assert.equal(await night.interrupt(t,b,motor,{world:{}}),true);assert.equal(wakes,1);assert.equal(t.phase,'night_hold');
});
test('shelter watch requires morning and its full timer, never just a sleep or historical night',async()=>{
 const {t,b,motor}=fixture(),state={world:{first_night:{hold_seconds:0}}};t.wilderness.nightSeen=true;
 b.time.timeOfDay=6000;await night.tick(t,b,motor,state);assert.equal(t.phase,'night_hold');
 b.time.timeOfDay=14000;await night.tick(t,b,motor,state);assert.equal(b.isSleeping,true);assert.equal(t.phase,'night_hold');
 b.time.timeOfDay=0;await night.tick(t,b,motor,state);assert.equal(t.phase,'night_hold','must wait for server wake');
 b.isSleeping=false;state.world.first_night.hold_seconds=180;await night.tick(t,b,motor,state);assert.equal(t.phase,'night_hold','timer still applies after dawn');
 state.world.first_night.hold_seconds=0;await night.tick(t,b,motor,state);assert.equal(t.phase,'complete');assert.ok(t.milestones.includes('survived'));
 assert.equal(night.report(t).sleep.morning_seen,true);
});
test('nearby monsters do not send an already sheltered watcher back into travel',async()=>{
 const {t,b,motor}=fixture();b.entities={z:{name:'zombie',position:new Vec3(2,64,0)}};b.world={raycast:()=>null};
 assert.equal(await night.interrupt(t,b,motor,{world:{}}),false);assert.equal(t.phase,'night_hold');
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {CONTROL_KEYS,startIssue,frozenStartIssue,sampleFrozenDashboard,openingAttackTask,healthUpdate,recordEvent,
 sampleControls}=require('../scripts/combat_execution.cjs');

test('matched start rejects predecision damage and drift, but accepts wrapped yaw',()=>{
 const player={position:[0,211,0],yaw:2*Math.PI-.004};
 const target={position:[8,211,0]};
 const frozen={player,target};
 assert.equal(startIssue(frozen,{...player,yaw:.002},target,0,false,45),null);
 assert.equal(startIssue(frozen,player,target,2,false,45),'damage before first decision');
 assert.equal(startIssue(frozen,player,{position:[8.36,211,0]},0,false,45),'target drift before first decision');
 assert.equal(startIssue(frozen,{...player,yaw:.02},target,0,false,45),'player drift before first decision');
 assert.equal(startIssue(frozen,player,target,0,false,501),'slow first decision');
});

test('a frozen start must keep its entities, pose, health and equipment through polling and release',()=>{
 const at=(x)=>({position:[x,211,0],yaw:0,pitch:0,on_ground:true});
 const frozen={player:at(0),target:at(8),player_id:1,target_id:2,ai_frozen:true,
  gamemode:'survival',health:20,food:20,saturation:20,loadout:{mainhand:'iron_sword'},
  target_equipment:[null],item_state:[['iron_sword',1,0]]};
 const issue=(actual)=>frozenStartIssue(frozen,actual,0,false,5);
 assert.equal(issue(structuredClone(frozen)),null);
 assert.equal(issue({...frozen,target_id:3}),'frozen fixture entity changed');
 assert.equal(issue({...frozen,ai_frozen:false}),'target unfrozen before first decision');
 assert.equal(issue({...frozen,target:at(8.10)}),'frozen fixture pose changed');
 assert.equal(issue({...frozen,player:{...frozen.player,pitch:.2}}),'frozen fixture pose changed');
 assert.equal(issue({...frozen,food:19}),'frozen fixture survival state changed');
 assert.equal(issue({...frozen,target_equipment:['iron_sword']}),'frozen fixture loadout changed');
 assert.equal(issue({...frozen,item_state:[['iron_sword',1,1]]}),'frozen fixture loadout changed');
});

test('frozen dashboard sampling retries timeouts only and stays within three attempts',async()=>{
 const calls=[];
 const waits=[];
 const healthy={ready:true,pid:123};
 const timeout={unavailable:'TimeoutError'};
 const sample=async(ms)=>{calls.push(ms);return calls.length===3?healthy:timeout;};
 const checkStart=()=>null;
 const wait=async(ms)=>{waits.push(ms);};
 const recovered=await sampleFrozenDashboard(sample,checkStart,wait);
 assert.deepEqual(calls,[1500,1500,1500]);
 assert.deepEqual(waits,[250,250]);
 assert.equal(recovered.issue,null);
 assert.equal(recovered.server,healthy);
 assert.deepEqual(recovered.attempts.map(x=>x.outcome),['TimeoutError','TimeoutError','received']);
 const exhausted=await sampleFrozenDashboard(async()=>timeout,checkStart,async()=>{});
 assert.equal(exhausted.attempts.length,3);
 assert.equal(exhausted.server,timeout);
 const response={unavailable:'HTTP 503'};
 const rejected=await sampleFrozenDashboard(async()=>response,checkStart,()=>assert.fail('HTTP errors must not retry'));
 assert.equal(rejected.attempts.length,1);
 assert.equal(rejected.server,response);
});

test('frozen dashboard retry aborts if the verified start changes during backoff or fetch',async()=>{
 let issue=null;
 const stopped=await sampleFrozenDashboard(async()=>({unavailable:'TimeoutError'}),()=>issue,async()=>{
  issue='frozen fixture loadout changed';
 });
 assert.equal(stopped.attempts.length,1);
 assert.equal(stopped.issue,'frozen fixture loadout changed');
 issue=null;
 const changed=await sampleFrozenDashboard(async()=>{
  issue='target unfrozen before first decision';
  return {ready:true,pid:123};
 },()=>issue,()=>assert.fail('Changed state must stop immediately'));
 assert.equal(changed.attempts.length,1);
 assert.equal(changed.issue,'target unfrozen before first decision');
});

test('opening swing can omit only the critical wind-up and only for one observed eligible action',()=>{
 const task=Object.freeze({critical_hits:true,weapon:'iron_sword',bounds:[0,10,0,10]});
 const sensed={distance:3,sight:true,enemy:{id:9},gear:{weapon:true},cooldown:0};
 const fresh=()=>({task,sensed,observedGrounded:true});
 const grounded=fresh();
 assert.equal(openingAttackTask(grounded,undefined,6),task);
 const swing=openingAttackTask(grounded,'grounded',6);
 assert.deepEqual(swing,{...task,critical_hits:false});
 assert.equal(swing.bounds,task.bounds);
 assert.equal(openingAttackTask(grounded,undefined,6),task);
 assert.throws(()=>openingAttackTask(grounded,'grounded',6),/repeated/);
 assert.equal(openingAttackTask(fresh(),'helper',6),task);
 assert.throws(()=>openingAttackTask(fresh(),'helper',2),/Invalid/);
 assert.throws(()=>openingAttackTask({...fresh(),observedGrounded:false},'helper',6),/grounded/);
 assert.throws(()=>openingAttackTask({...fresh(),sensed:{...sensed,cooldown:.1}},'grounded',6),/eligible/);
});

test('native health updates preserve gross damage across healing and do not count respawn as damage',()=>{
 const encounter={health:20,damage:0,damageEvents:0};
 for(const health of [17,17,18,16,0,20])healthUpdate(encounter,health);
 assert.deepEqual(encounter,{health:20,damage:21,damageEvents:3});
});

test('physics samples distinguish movement and held item execution from nominal decisions',()=>{
 const window={physics_ticks:0,controls_ticks:Object.fromEntries(CONTROL_KEYS.map(key=>[key,0])),held_item_ticks:0};
 sampleControls(window,{forward:true,left:true},false);
 sampleControls(window,{left:true},true);
 sampleControls(window,{},true);
 assert.equal(window.physics_ticks,3);
 assert.equal(window.controls_ticks.forward,1);
 assert.equal(window.controls_ticks.left,2);
 assert.equal(window.controls_ticks.sprint,0);
 assert.equal(window.held_item_ticks,2);
});

test('one monotonic journal keeps proposal, request, damage and between-decision receipt ordering',()=>{
 const c={events:[],releaseMonotonic:null,activeDecision:null};
 assert.equal(recordEvent(c,'target_hurt',{},97),null);
 c.releaseMonotonic=100;c.activeDecision=1;
 recordEvent(c,'proposal',{action:6},99);
 recordEvent(c,'attack_request',{target_id:21},130);
 c.activeDecision=null;
 recordEvent(c,'target_hurt',{target_id:21},235);
 recordEvent(c,'player_damage',{loss:1.38},236);
 c.closed=true;recordEvent(c,'player_hurt',{source_id:21},237);
 assert.deepEqual(c.events,[
  {kind:'proposal',at_ms:-1,decision:1,action:6},
  {kind:'attack_request',at_ms:30,decision:1,target_id:21},
  {kind:'target_hurt',at_ms:135,decision:null,target_id:21},
  {kind:'player_damage',at_ms:136,decision:null,loss:1.38}
 ]);
});

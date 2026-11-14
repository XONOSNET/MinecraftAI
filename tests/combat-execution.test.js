const test=require('node:test');
const assert=require('node:assert/strict');
const {CONTROL_KEYS,startIssue,healthUpdate,sampleControls}=require('../scripts/combat_execution.cjs');

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

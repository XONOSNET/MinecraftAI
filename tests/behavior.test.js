const test=require('node:test'),assert=require('node:assert/strict');
const {apply,forBot,defaults}=require('../controller/behavior'),space=require('../controller/resource_space'),{createRecovery}=require('../controller/recovery');
test('bot settings are isolated, validated, and reset to defaults without changing weights',()=>{
 const a={},b={};apply(a,{revision:'one',values:{...defaults,player_clearance:3}});
 assert.equal(forBot(a).player_clearance,3);assert.equal(forBot(b).player_clearance,2);
 assert.throws(()=>apply(a,{values:{...defaults,player_clearance:0}}),/Invalid behavior/);
 assert.equal(forBot(a).player_clearance,3);apply(a,null);assert.equal(forBot(a).player_clearance,2);
});
test('individual clearance changes the actual player exclusion radius',()=>{
 const bot={username:'mine',entity:{id:1,position:{x:0,y:64,z:0}},players:{other:{username:'other',gamemode:0,entity:{id:2,position:{x:2.7,y:64,z:0}}}}};
 assert.equal(space.clearOfPlayers(bot,bot.entity.position),true);
 apply(bot,{revision:'two',values:{...defaults,player_clearance:3}});
 assert.equal(space.clearOfPlayers(bot,bot.entity.position),false);
});
test('configured wall-check delay changes recovery timing without disabling safety checks',()=>{
 const recovery=createRecovery(()=>({...defaults,recovery_wait_ms:1800})),base={forward:true},sensed={wallAhead:true,rearSafe:true},p={x:0,z:0},permissions={move:true,turn:true};
 recovery.update(base,sensed,p,0,0,permissions);recovery.update(base,sensed,p,0,1000,permissions);assert.equal(recovery.active(),false);
 const result=recovery.update(base,sensed,p,0,1800,permissions);assert.equal(recovery.active(),true);assert.equal(result.back,true);
});

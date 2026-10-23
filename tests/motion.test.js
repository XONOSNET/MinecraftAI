const {test}=require('node:test');const assert=require('node:assert/strict');const {applyMotion}=require('../controller/motion');
test('forward stays held on repeated decisions; turn and wait stop it',()=>{const state={forward:false,jump:false},changes=[];const bot={getControlState:k=>state[k],setControlState:(k,v)=>{state[k]=v;changes.push([k,v])}};const permissions={move:true,jump:true};applyMotion(bot,0,permissions);applyMotion(bot,0,permissions);assert.deepEqual(changes,[['forward',true]]);applyMotion(bot,1,permissions);assert.equal(state.forward,false);applyMotion(bot,3,permissions);assert.deepEqual(state,{forward:true,jump:true});applyMotion(bot,4,permissions);assert.deepEqual(state,{forward:false,jump:false});applyMotion(bot,0,{move:false});assert.equal(state.forward,false)});


test('paused swimmers tread water instead of drowning while data is analyzed',()=>{
 const {pauseMotion}=require('../controller/motion');const state={forward:true,jump:false,sneak:false};
 const bot={entity:{isInWater:true},getControlState:k=>state[k],setControlState:(k,v)=>state[k]=v};
 pauseMotion(bot,{move:true,jump:true});assert.equal(state.forward,false);assert.equal(state.jump,true);
 bot.entity.isInWater=false;pauseMotion(bot,{move:true,jump:true});assert.equal(state.jump,false);
});

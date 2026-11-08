const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events');
const errors=require('../controller/service_errors'),crafting=require('../controller/crafting');

test('a native inventory timeout resumes crafting from authoritative inventory without restarting the lesson',async()=>{
 const registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry),windows=require('prismarine-windows')(registry);
 const bot=new EventEmitter(),window=windows.createWindow(0,'minecraft:inventory'),log=registry.itemsByName.oak_log.id,planks=registry.itemsByName.oak_planks.id;
 bot.registry=registry;bot.inventory=window;window.updateSlot(9,new Item(log,1));
 let failOnce=true,produced=0;
 bot.recipesFor=()=>[{inShape:[[{id:log}]],result:{id:planks,count:4}}];
 bot._client={write(_name,p){
  if(failOnce){failOnce=false;return;}
  if(p.mode===0){
   const current=window.slots[p.slot];
   if(p.slot===0){assert.equal(current?.type,planks);assert.equal(window.selectedItem,null);window.selectedItem=new Item(planks,4);window.updateSlot(1,null);produced+=4;}
   else if(p.mouseButton===1){assert.ok(window.selectedItem);window.updateSlot(p.slot,new Item(window.selectedItem.type,1));window.selectedItem.count--;if(!window.selectedItem.count)window.selectedItem=null;}
   else{const cursor=window.selectedItem;window.selectedItem=current;window.updateSlot(p.slot,cursor);}
   window.updateSlot(0,window.slots[1]?.type===log?new Item(planks,4):null);
  }
  queueMicrotask(()=>bot.emit('setWindowItems:0'));
 }};
 const state={phase:'craft',lastProgress:123,milestones:[],run:'same-trial'};
 await assert.rejects(crafting.craft(bot,'oak_planks',1),error=>{assert.equal(errors.recover(state,error,1000),true);return true;});
 assert.equal(state.phase,'craft');assert.equal(state.lastProgress,123);assert.deepEqual(state.milestones,[]);assert.equal(produced,0);
 assert.equal(window.items().find(i=>i.type===log).count,1);
 await crafting.craft(bot,'oak_planks',1);
 assert.equal(produced,4);assert.equal(window.items().some(i=>i.type===log),false);assert.equal(window.items().find(i=>i.type===planks).count,4);assert.equal(window.selectedItem,null);
});

test('crafting retries share the existing thirty-second bound and never mask recipe or safety failures',()=>{
 for(const message of ['Crafting table did not open','Timed out synchronizing crafting inventory']){
  const state={phase:'tools',lastProgress:55,milestones:['hut']},error=Error(message);
  assert.equal(errors.recover(state,error,1000),true);assert.equal(state.serviceRetryAt,1500);
  assert.equal(errors.recover(state,error,30999),true);assert.equal(state.serviceFailureSince,1000);
  assert.equal(errors.recover(state,error,31000),false);assert.equal(state.failureCategory,'infrastructure');
  assert.equal(state.lastProgress,55);assert.equal(state.phase,'tools');assert.deepEqual(state.milestones,['hut']);
 }
 for(const message of ['Missing materials for wooden_pickaxe','No safe route','Inventory full while crafting','Server did not produce recipe result for oak_planks'])assert.equal(errors.recover({},Error(message),0),false);
});

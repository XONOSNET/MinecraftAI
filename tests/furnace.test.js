const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{smelt}=require('../controller/furnace');

test('a missing furnace response closes the window and resumes from confirmed output without adding ingredients',async()=>{
 const registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry),b=new EventEmitter();b.registry=registry;
 const output=new Item(registry.itemsByName.charcoal.id,1),slots=[null,null,output,null,null];let opens=0,closed=0,collected=0;
 b.openFurnace=async()=>{opens++;const w={id:1,inventoryStart:3,inventoryEnd:5,slots,selectedItem:null,close(){closed++;b.currentWindow=null;}};b.currentWindow=w;return w;};
 b._client={write(_packet,data){if(opens===1)return;const w=b.currentWindow;
  if(data.slot===2){w.selectedItem=slots[2];slots[2]=null;}
  else if(data.slot===3){slots[3]=w.selectedItem;w.selectedItem=null;collected++;}
  else assert.equal(data.slot,-999,'resumption must not add input or fuel');
  queueMicrotask(()=>b.emit('setWindowItems:1'));
 }};
 const errors=require('../controller/service_errors'),state={phase:'smelt',lastProgress:55,milestones:['furnace'],run:'same-trial'};
 await assert.rejects(smelt(b,{}),error=>{assert.equal(errors.recover(state,error,1000),true);return true;});
 assert.equal(closed,1);assert.equal(b.currentWindow,null);assert.equal(b.listenerCount('setWindowItems:1'),0);assert.equal(slots[2],output);
 await smelt(b,{});assert.equal(collected,1);assert.equal(slots[3],output);assert.equal(slots[2],null);assert.equal(closed,2);
 assert.equal(state.phase,'smelt');assert.equal(state.lastProgress,55);assert.deepEqual(state.milestones,['furnace']);assert.equal(state.run,'same-trial');
 assert.equal(errors.recover(state,Error('Furnace inventory acknowledgement timed out'),31000),false);
 for(const message of ['Missing furnace ingredient','Furnace did not produce charcoal','Inventory full while collecting charcoal'])assert.equal(errors.recover({},Error(message),0),false);
});
test('repeated furnace operations release their protocol listener on window close',async()=>{
 const registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry),b=new EventEmitter(),client=new EventEmitter();b.registry=registry;b._client=client;
 b.openFurnace=async()=>{const w=new EventEmitter(),listener=()=>{};client.on('craft_progress_bar',listener);Object.assign(w,{id:1,inventoryStart:3,inventoryEnd:5,slots:[null,null,new Item(registry.itemsByName.iron_ingot.id,1),null,null]});w.close=()=>{client.removeListener('craft_progress_bar',listener);b.currentWindow=null;};b.currentWindow=w;return w;};
 b.closeWindow=()=>{b.currentWindow=null;};
 client.write=(packet,data)=>{const w=b.currentWindow;if(data.slot===2){w.selectedItem=w.slots[2];w.slots[2]=null;}else if(data.slot===3){w.slots[3]=w.selectedItem;w.selectedItem=null;}queueMicrotask(()=>b.emit('setWindowItems:1'));};
 for(let i=0;i<3;i++){await smelt(b,{},'raw_iron','iron_ingot',n=>n==='coal');assert.equal(client.listenerCount('craft_progress_bar'),0);}
});

test('a destroyed furnace is detected before opening, including destruction during a pending open',async()=>{
 const {Vec3}=require('vec3'),registry=require('minecraft-data')('1.21.4');let name='air',opens=0;
 const block={name:'furnace',position:new Vec3(0,64,0)},b={registry,blockAt:()=>({name}),openFurnace:async()=>{opens++;name='air';throw Error('Event windowOpen did not fire within timeout of 20000ms');}};
 const changed=e=>e.code==='BUILD_STATION_CHANGED';await assert.rejects(smelt(b,block),changed);assert.equal(opens,0);
 name='furnace';await assert.rejects(smelt(b,block),e=>{assert.equal(require('../controller/service_errors').recover({phase:'smelt'},e,0),true);return changed(e);});assert.equal(opens,1);
});

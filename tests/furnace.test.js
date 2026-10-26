const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{smelt}=require('../controller/furnace');
test('repeated furnace operations release their protocol listener on window close',async()=>{
 const registry=require('minecraft-data')('1.21.4'),Item=require('prismarine-item')(registry),b=new EventEmitter(),client=new EventEmitter();b.registry=registry;b._client=client;
 b.openFurnace=async()=>{const w=new EventEmitter(),listener=()=>{};client.on('craft_progress_bar',listener);Object.assign(w,{id:1,inventoryStart:3,inventoryEnd:5,slots:[null,null,new Item(registry.itemsByName.iron_ingot.id,1),null,null]});w.close=()=>{client.removeListener('craft_progress_bar',listener);b.currentWindow=null;};b.currentWindow=w;return w;};
 b.closeWindow=()=>{b.currentWindow=null;};
 client.write=(packet,data)=>{const w=b.currentWindow;if(data.slot===2){w.selectedItem=w.slots[2];w.slots[2]=null;}else if(data.slot===3){w.slots[3]=w.selectedItem;w.selectedItem=null;}queueMicrotask(()=>b.emit('setWindowItems:1'));};
 for(let i=0;i<3;i++){await smelt(b,{},'raw_iron','iron_ingot',n=>n==='coal');assert.equal(client.listenerCount('craft_progress_bar'),0);}
});

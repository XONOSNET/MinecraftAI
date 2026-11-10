// Server-authoritative furnace slots, including the ten-second smelting wait.
async function smelt(bot,block,input='oak_log',output='charcoal',fuel=n=>n.endsWith('_planks')){
 const changed=()=>!!bot.blockAt&&!!block?.position&&bot.blockAt(block.position)?.name!=='furnace';
 const stationError=()=>{const e=Error('Furnace workstation changed; rechecking damaged construction');e.code='BUILD_STATION_CHANGED';return e;};
 const Item=require('prismarine-item')(bot.registry);let window;
 const click=async(slot,button=0,mode=0)=>{
  await new Promise((resolve,reject)=>{
   const event=`setWindowItems:${window.id}`,done=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Furnace inventory acknowledgement timed out'));},3000);
   bot.once(event,done);bot._client.write('window_click',{windowId:window.id,stateId:-1,slot,mouseButton:button,mode,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});
  });await new Promise(r=>setTimeout(r,100));
 };
 const one=async(match,dest)=>{
  const source=window.slots.slice(window.inventoryStart,window.inventoryEnd).find(i=>i&&match(i.name));
  if(!source)throw Error('Missing furnace ingredient');
  await click(source.slot);await click(dest,1);if(window.selectedItem)await click(source.slot);
 };
 try{
  if(changed())throw stationError();
  try{window=await bot.openFurnace(block);}catch(error){if(changed())throw stationError();throw error;}await click(-999,2,5);
  if(!window.slots[0]&&!window.slots[2])await one(n=>input==='oak_log'?n.endsWith('_log'):n===input,0);
  if(!window.slots[1]&&!window.slots[2])await one(fuel,1);
  const deadline=Date.now()+30000;
  while(window.slots[2]?.name!==output){
   if(Date.now()>deadline)throw Error('Furnace did not produce '+output);
   // A stick burns for only five seconds; one cooking operation takes ten.
   // Queue more fuel when the previous item has entered the burn timer.
   if(!window.slots[1]&&window.slots.slice(window.inventoryStart,window.inventoryEnd).some(i=>i&&fuel(i.name)))await one(fuel,1);
   await new Promise(r=>setTimeout(r,500));await click(-999,2,5);
  }
  await click(2);const empty=window.slots.slice(window.inventoryStart,window.inventoryEnd).findIndex(i=>!i);
  if(empty<0)throw Error('Inventory full while collecting '+output);
  await click(window.inventoryStart+empty);
  if(window.selectedItem)throw Error(output+' did not return to inventory');
 }finally{if(window&&bot.currentWindow){if(window.close)await window.close();else await bot.closeWindow(window);}}
}
const charcoal=(bot,block)=>smelt(bot,block);
module.exports={charcoal,smelt};

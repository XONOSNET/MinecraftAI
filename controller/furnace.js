// Server-authoritative furnace slots, including the ten-second smelting wait.
async function charcoal(bot,block){
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
  window=await bot.openFurnace(block);await click(-999,2,5);
  if(!window.slots[0]&&!window.slots[2])await one(n=>n.endsWith('_log'),0);
  if(!window.slots[1]&&!window.slots[2])await one(n=>n.endsWith('_planks'),1);
  const deadline=Date.now()+30000;
  while(window.slots[2]?.name!=='charcoal'){
   if(Date.now()>deadline)throw Error('Furnace did not produce charcoal');
   await new Promise(r=>setTimeout(r,500));await click(-999,2,5);
  }
  await click(2);const empty=window.slots.slice(window.inventoryStart,window.inventoryEnd).findIndex(i=>!i);
  if(empty<0)throw Error('Inventory full while collecting charcoal');
  await click(window.inventoryStart+empty);
  if(window.selectedItem)throw Error('Charcoal did not return to inventory');
 }finally{if(window&&bot.currentWindow)await bot.closeWindow(window);}
}
module.exports={charcoal};

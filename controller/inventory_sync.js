// Handle authoritative player/cursor updates that are separate from open windows.
function playerSlot(slot){if(slot<=8)return slot+36;if(slot>=36&&slot<=39)return 44-slot;if(slot===40)return 45;return slot;}
function attach(bot){
 const Item=require('prismarine-item')(bot.registry);
 bot._client.on('set_cursor_item',packet=>{const window=bot.currentWindow||bot.inventory;if(window)window.selectedItem=Item.fromNotch(packet.contents);});
 bot._client.on('set_slot',packet=>{
  if(!bot.inventory)return;
  if(packet.windowId===-1&&packet.slot===-1){const window=bot.currentWindow||bot.inventory;window.selectedItem=Item.fromNotch(packet.item);}
  if(packet.windowId===-2)bot.inventory.updateSlot(playerSlot(packet.slot),Item.fromNotch(packet.item));
 });
}
async function sync(bot){
 if(bot._syncWindow)return bot._syncWindow(bot.currentWindow||bot.inventory);
 const window=bot.currentWindow||bot.inventory,Item=require('prismarine-item')(bot.registry);
 await new Promise((resolve,reject)=>{const event=`setWindowItems:${window.id}`,done=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Inventory synchronization timed out'));},3000);bot.once(event,done);bot._client.write('window_click',{windowId:window.id,stateId:-1,slot:-999,mouseButton:2,mode:5,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});});
}
async function equip(bot,name){
 await sync(bot);
 if(bot.heldItem?.name===name&&bot.heldItem.count>0)return;
 const Item=require('prismarine-item')(bot.registry),item=bot.inventory.items().find(i=>i.name===name);
 if(!item)throw Error('Missing item to equip: '+name);
 let slot=item.slot>=36&&item.slot<=44?item.slot-36:0;
 if(item.slot<36||item.slot>44){
  const window=bot.currentWindow||bot.inventory;if(window.id!==0)throw Error('Close the crafting window before equipping.');
  await new Promise((resolve,reject)=>{const event='setWindowItems:0',done=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Equipment synchronization timed out'));},3000);bot.once(event,done);bot._client.write('window_click',{windowId:0,stateId:-1,slot:item.slot,mouseButton:slot,mode:2,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});});
  await new Promise(r=>setTimeout(r,100));await sync(bot);
 }
 bot.setQuickBarSlot(slot);bot._client.write('held_item_slot',{slotId:slot});
 await new Promise(r=>setTimeout(r,50));await sync(bot);
 if(bot.heldItem?.name!==name)throw Error('Server did not equip '+name);
}
module.exports={attach,sync,equip,playerSlot};

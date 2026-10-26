const {Vec3}=require('vec3');
const TOOLS=['wooden_pickaxe','wooden_axe','wooden_shovel'];
function supplied(bot){return bot.inventory.items().filter(i=>i.name.endsWith('_planks')).reduce((n,i)=>n+i.count,0);}
async function stockChest(bot,block,amount=8,match=n=>n.endsWith('_planks')){
 const Item=require('prismarine-item')(bot.registry);let window;
 const click=async(slot,button=0,mode=0)=>{
  await new Promise((resolve,reject)=>{
   const event=`setWindowItems:${window.id}`,done=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Chest inventory acknowledgement timed out'));},3000);
   bot.once(event,done);bot._client.write('window_click',{windowId:window.id,stateId:-1,slot,mouseButton:button,mode,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});
  });await new Promise(r=>setTimeout(r,100));
 };
 try{
  window=await bot.openContainer(block);await click(-999,2,5);
  const stored=()=>window.slots.slice(0,window.inventoryStart).filter(i=>i&&match(i.name)).reduce((n,i)=>n+i.count,0);
  while(stored()<amount){
   const source=window.slots.slice(window.inventoryStart,window.inventoryEnd).find(i=>i&&match(i.name));
   if(!source)throw Error('Not enough matching supplies for the chest lesson');
   let dest=window.slots.slice(0,window.inventoryStart).findIndex(i=>i?.type===source.type&&i.count<i.stackSize);
   if(dest<0)dest=window.slots.slice(0,window.inventoryStart).findIndex(i=>!i);
   if(dest<0)throw Error('No chest slot available');
   await click(source.slot);
   while(window.selectedItem&&stored()<amount)await click(dest,1);
   if(window.selectedItem)await click(source.slot);
  }
  return stored();
 }finally{if(window&&bot.currentWindow)await bot.closeWindow(window);}
}
function chestPosition(plot){return require('./house').point(plot,'chest');}
module.exports={TOOLS,supplied,stockChest,chestPosition};

// Native 1.21.4 crafting with server-authoritative inventory on every click.
// No optimistic result injection: the server must produce the output item.
function recipeSlots(recipe,width){
 const result=[];
 if(recipe.inShape)for(let y=0;y<recipe.inShape.length;y++)for(let x=0;x<recipe.inShape[y].length;x++){const ingredient=recipe.inShape[y][x];if(ingredient.id!==-1)result.push({slot:1+y*width+x,ingredient});}
 else for(let i=0;i<(recipe.ingredients||[]).length;i++)result.push({slot:1+i,ingredient:recipe.ingredients[i]});
 return result;
}
async function craft(bot,name,times=1,table=null){
 const Item=require('prismarine-item')(bot.registry);
 const response=(window,send)=>new Promise((resolve,reject)=>{
  const event=`setWindowItems:${window.id}`;const done=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Timed out synchronizing crafting inventory'));},3000);
  bot.once(event,done);try{send();}catch(error){clearTimeout(timer);bot.removeListener(event,done);reject(error);}
 });
 const click=async(slot,button=0)=>{const window=bot.currentWindow||bot.inventory;await response(window,()=>bot._client.write('window_click',{windowId:window.id,stateId:-1,slot,mouseButton:button,mode:0,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)}));await new Promise(r=>setTimeout(r,100));await sync();};
 const sync=async()=>{const window=bot.currentWindow||bot.inventory;await response(window,()=>bot._client.write('window_click',{windowId:window.id,stateId:-1,slot:-999,mouseButton:2,mode:5,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)}));};
 const stow=async()=>{const window=bot.currentWindow||bot.inventory,item=window.selectedItem;if(!item)return;
  let slot=null;for(let i=window.inventoryStart;i<window.inventoryEnd;i++)if(!window.slots[i]){slot=i;break;}if(slot===null)for(let i=window.inventoryStart;i<window.inventoryEnd;i++){const other=window.slots[i];if(other?.type===item.type&&other.count+item.count<=other.stackSize){slot=i;break;}}
  if(slot===null)throw Error('Inventory full while crafting');await click(slot);
  if(window.selectedItem)throw Error('Server did not return crafted item to inventory');
 };
 let opened=false;
 try{
  if(table){const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{bot.removeListener('windowOpen',done);reject(Error('Crafting table did not open'));},3000);const done=()=>{clearTimeout(timer);resolve();};bot.once('windowOpen',done);});await bot.activateBlock(table);await promise;opened=true;}
  for(let i=0;i<times;i++){
   await sync();await stow();const window=bot.currentWindow||bot.inventory,width=table?3:2;
   for(let slot=1;slot<=width*width;slot++)if(window.slots[slot]){await click(slot);await stow();}
   const id=bot.registry.itemsByName[name]?.id,recipe=id&&bot.recipesFor(id,null,1,table)[0];if(!recipe)throw Error('Missing materials for '+name);
   for(const entry of recipeSlots(recipe,width)){
    const source=window.findInventoryItem(entry.ingredient.id,entry.ingredient.metadata);if(!source)throw Error('Missing recipe ingredient for '+name);
    await click(source.slot);await click(entry.slot,1);await stow();
   }
   await sync();if(window.slots[0]?.type!==id)throw Error('Server did not produce recipe result for '+name);
   await click(0);if(window.selectedItem?.type!==id)throw Error('Server did not release crafted '+name);await stow();
  }
 }finally{if(opened&&bot.currentWindow){await stow().catch(()=>{});await bot.closeWindow(bot.currentWindow);}}
}
module.exports={craft,recipeSlots};

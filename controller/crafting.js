// Native 1.21.4 crafting with server-authoritative inventory on every click.
// No optimistic result injection: the server must produce the output item.
const {transfer,inventoryCount}=require('./window_transfer');
function recipeSlots(recipe,width){
 const result=[];
 if(recipe.inShape)for(let y=0;y<recipe.inShape.length;y++)for(let x=0;x<recipe.inShape[y].length;x++){const ingredient=recipe.inShape[y][x];if(ingredient.id!==-1)result.push({slot:1+y*width+x,ingredient});}
 else for(let i=0;i<(recipe.ingredients||[]).length;i++)result.push({slot:1+i,ingredient:recipe.ingredients[i]});
 return result;
}
function mixedWhiteBed(bot,window){
 const wool=bot.registry.itemsByName.white_wool.id;
 const stock=window.slots.slice(window.inventoryStart,window.inventoryEnd);
 if(inventoryCount(window,item=>item.type===wool)<3)return null;
 const planks=[];
 for(const item of stock){
  if(!item?.name.endsWith('_planks'))continue;
  for(let i=0;i<item.count&&planks.length<3;i++)planks.push({id:item.type,metadata:item.metadata});
  if(planks.length===3)return {inShape:[Array.from({length:3},()=>({id:wool})),planks]};
 }
 return null;
}
async function craft(bot,name,times=1,table=null){
 const Item=require('prismarine-item')(bot.registry);
 let window=bot.inventory,opened=false;
 const response=(window,send)=>new Promise((resolve,reject)=>{
  const event=`setWindowItems:${window.id}`;const done=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{bot.removeListener(event,done);reject(Error('Timed out synchronizing crafting inventory'));},3000);
  bot.once(event,done);try{send();}catch(error){clearTimeout(timer);bot.removeListener(event,done);reject(error);}
 });
 const send=(slot,button,mode)=>{
  if((bot.currentWindow||bot.inventory)!==window)throw Error('Timed out synchronizing crafting inventory');
  bot._client.write('window_click',{windowId:window.id,stateId:-1,slot,mouseButton:button,mode,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});
 };
 const click=async(slot,button=0,mode=0)=>{await response(window,()=>send(slot,button,mode));await new Promise(r=>setTimeout(r,100));await sync();};
 const sync=()=>response(window,()=>send(-999,2,5));
 const stow=async()=>{const item=window.selectedItem;if(!item)return;
  let slot=null;for(let i=window.inventoryStart;i<window.inventoryEnd;i++){const other=window.slots[i];if(other&&Item.equal(other,item,false)&&other.count+item.count<=other.stackSize){slot=i;break;}}if(slot===null)for(let i=window.inventoryStart;i<window.inventoryEnd;i++)if(!window.slots[i]){slot=i;break;}
  if(slot===null)throw Error('Inventory full while crafting');await click(slot);
  if(window.selectedItem)throw Error('Server did not return crafted item to inventory');
 };
 const personal=table?null:Symbol('personal crafting');
 if(personal)bot.labObserverCraft=personal;
 try{
  if(table){
   window=await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);bot.removeListener('windowOpen',done);};
    const done=openedWindow=>{cleanup();resolve(openedWindow);};
    const timer=setTimeout(()=>{cleanup();reject(Error('Crafting table did not open'));},3000);
    bot.once('windowOpen',done);
    Promise.resolve().then(()=>bot.activateBlock(table)).catch(error=>{cleanup();reject(error);});
   });
   opened=true;
   if(!window.type.startsWith('minecraft:crafting'))throw Error('Crafting table did not open');
  }
  for(let remaining=times;remaining>0;){
   await sync();await stow();const width=table?3:2;
   for(let slot=1;slot<=width*width;slot++)if(window.slots[slot]){await click(slot);await stow();}
   const id=bot.registry.itemsByName[name]?.id;
   let recipe=id&&bot.recipesFor(id,null,1,table)[0];
   // Minecraft accepts mixed planks for beds. The recipe library expands the
   // plank tag into single-species recipes, so check the live workbench stock.
   if(!recipe&&id&&table&&name==='white_bed'&&remaining===1)recipe=mixedWhiteBed(bot,window);
   if(!recipe)throw Error('Missing materials for '+name);
   const entries=recipeSlots(recipe,width);
   const batch=entries.reduce((limit,{ingredient})=>Math.min(limit,bot.registry.items[ingredient.id]?.stackSize??1),remaining);
   const selected=batch>1?bot.recipesFor(id,null,batch*recipe.result.count,table).find(candidate=>JSON.stringify(recipeSlots(candidate,width))===JSON.stringify(entries)):recipe;
   if(!selected)throw Error('Missing materials for '+name);
   for(const {slot,ingredient} of entries){
    const matches=item=>item.type===ingredient.id&&(ingredient.metadata==null||item.metadata===ingredient.metadata);
    await transfer(window,click,matches,slot,batch);
    if(window.slots[slot]?.count!==batch||!matches(window.slots[slot]))throw Error('Timed out synchronizing crafting inventory');
   }
   await sync();if(window.slots[0]?.type!==id)throw Error('Server did not produce recipe result for '+name);
   if(batch===1){
    await click(0);if(window.selectedItem?.type!==id)throw Error('Server did not release crafted '+name);await stow();
   }else{
    const output=window.slots[0],quantity=output.count*batch,match=item=>Item.equal(item,output,false);
    const capacity=window.slots.slice(window.inventoryStart,window.inventoryEnd)
     .reduce((total,item)=>total+(!item?output.stackSize:match(item)?output.stackSize-item.count:0),0);
    if(capacity<quantity)throw Error('Inventory full while crafting');
    const before=inventoryCount(window,match);
    try{await click(0,0,1);}catch(error){
     // A lost acknowledgement can arrive after the server has already crafted.
     await sync();if(inventoryCount(window,match)-before!==quantity)throw error;
    }
    if(inventoryCount(window,match)-before!==quantity)throw Error('Server did not release the requested batch of '+name);
   }
   remaining-=batch;
  }
 }finally{
  if(personal&&bot.labObserverCraft===personal)delete bot.labObserverCraft;
  if(opened&&bot.currentWindow===window){
   await stow().catch(()=>{});
   if(bot.currentWindow===window)await bot.closeWindow(window);
  }
 }
}
module.exports={craft,recipeSlots};

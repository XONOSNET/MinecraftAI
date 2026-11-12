// Move only the requested quantity using confirmed cursor and slot updates.
function mismatch(message){
 const error=Error(message);
 error.code='INVENTORY_TRANSFER_MISMATCH';
 return error;
}

async function transfer(window,click,match,destination,count,{stage=false}={}){
 while(count>0){
  const stock=window.slots[destination];
  const inventory=window.slots.slice(window.inventoryStart,window.inventoryEnd);
  const sources=inventory.filter(item=>item&&match(item)&&(!stock||stock.type===item.type&&stock.metadata===item.metadata));
  const source=sources.find(item=>item.count===count)||sources.find(item=>item.count>=count)||sources.sort((a,b)=>b.count-a.count)[0];
  if(!source)throw Error('Missing material for inventory transfer');
  const slot=source.slot,available=source.count,half=Math.ceil(available/2);
  const moved=Math.min(count,available),surplus=available-moved;
  const empty=inventory.findIndex(item=>!item);
  const pick=async(from,quantity,button=0)=>{
   await click(from,button);
   if(window.selectedItem?.type!==source.type||window.selectedItem.count!==quantity)throw mismatch('Server did not pick up the requested material');
  };
  const deposit=async()=>{
   await click(destination);
   if(window.selectedItem)throw mismatch('Server did not accept the requested quantity');
  };
  if(!surplus||moved===half){
   await pick(slot,moved,surplus?1:0);await deposit();
  }else if(stage&&moved>1&&empty>=0){
   // Assemble the exact partial stack in the inventory before moving it into
   // an active recipe slot, where a furnace could begin consuming it.
   const staging=window.inventoryStart+empty,split=Math.min(moved,surplus);
   await pick(slot,available);
   for(let i=0;i<split;i++)await click(staging,1);
   if(window.slots[staging]?.count!==split)throw mismatch('Server did not split the requested material');
   if(split===moved){await click(slot);await pick(staging,moved);await deposit();}
   else{await deposit();await pick(staging,surplus);await click(slot);}
  }else{
   // Split directly into the requested slot if staging is unavailable.
   await pick(slot,available);
   for(let i=0;i<moved;i++)await click(destination,1);
   if(window.selectedItem?.count!==surplus)throw mismatch('Server did not accept the requested quantity');
   await click(slot);
  }
  if(window.selectedItem)throw mismatch('Server did not return the remaining material');
  count-=moved;
 }
}

function inventoryCount(window,match){
 return window.slots.slice(window.inventoryStart,window.inventoryEnd)
  .reduce((total,item)=>total+(item&&match(item)?item.count:0),0);
}

module.exports={transfer,inventoryCount};

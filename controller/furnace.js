// Server-authoritative furnace slots. Each item still takes its native cook time.
const {transfer,inventoryCount}=require('./window_transfer');
const burnTicks=name=>name==='coal'||name==='charcoal'?1600:name?.endsWith('_planks')?300:name==='stick'?100:0;
async function smelt(bot,block,input='oak_log',output='charcoal',fuel=n=>n.endsWith('_planks'),{amount=1,collect=amount,allowEmpty=false}={}){
 const changed=()=>!!bot.blockAt&&!!block?.position&&bot.blockAt(block.position)?.name!=='furnace';
 const stationError=()=>{const e=Error('Furnace workstation changed; rechecking damaged construction');e.code='BUILD_STATION_CHANGED';return e;};
 const Item=require('prismarine-item')(bot.registry);let window;
 const progress=new Map();
 const onProperty=packet=>{
  if(window&&packet.windowId!==window.id)return;
  if(!progress.has(packet.windowId))progress.set(packet.windowId,[]);
  progress.get(packet.windowId)[packet.property]=packet.value;
 };
 const inputMatches=item=>input==='oak_log'?item.name.endsWith('_log'):item.name===input;
 const fuelMatches=item=>fuel(item.name)&&burnTicks(item.name)>0;
 const ready=()=>window.slots[2]?.name===output?window.slots[2].count:0;
 const windowError=()=>Error('Furnace inventory acknowledgement timed out');
 const click=async(slot,button=0,mode=0)=>{
  if(bot.currentWindow!==window)throw changed()?stationError():windowError();
  await new Promise((resolve,reject)=>{
   const event=`setWindowItems:${window.id}`,done=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{bot.removeListener(event,done);reject(windowError());},3000);
   bot.once(event,done);
   try{bot._client.write('window_click',{windowId:window.id,stateId:-1,slot,mouseButton:button,mode,changedSlots:[],cursorItem:Item.toNotch(window.selectedItem)});}
   catch(error){clearTimeout(timer);bot.removeListener(event,done);reject(error);}
  });await new Promise(r=>setTimeout(r,100));
 };
 const stock=()=>window.slots.slice(window.inventoryStart,window.inventoryEnd).filter(Boolean);
 const heat=()=>{
  const [burn=0,,cooked=0,duration=200]=progress.get(window.id)||[];
  return {burn,cooked,duration:duration||200};
 };
 const fuelNeed=()=>{
  const {burn,cooked,duration}=heat();
  const queued=window.slots[1];
  return Math.max(0,(window.slots[0]?.count??0)*duration-cooked-burn-(queued?.count??0)*burnTicks(queued?.name));
 };
 const fillFuel=async()=>{
  const needed=fuelNeed(),queued=window.slots[1];
  if(!needed)return;
  const choices=[...new Set(stock().filter(fuelMatches).map(item=>item.name))]
   .filter(name=>!queued||queued.name===name)
   .map(name=>{
    const ticks=burnTicks(name),count=Math.min(Math.ceil(needed/ticks),inventoryCount(window,i=>i.name===name),
     (bot.registry.itemsByName[name]?.stackSize??64)-(queued?.count??0));
    return {name,count,coverage:count*ticks};
   }).filter(choice=>choice.count>0);
  choices.sort((a,b)=>Math.max(0,needed-a.coverage)-Math.max(0,needed-b.coverage)
   ||Math.max(0,a.coverage-needed)-Math.max(0,b.coverage-needed)||a.count-b.count);
  if(choices.length)await transfer(window,click,item=>item.name===choices[0].name,1,choices[0].count,{stage:true});
 };
 bot._client?.on?.('craft_progress_bar',onProperty);
 try{
  if(changed())throw stationError();
  try{window=await bot.openFurnace(block);}catch(error){if(changed())throw stationError();throw error;}await click(-999,2,5);
  if(window.slots[2]&&!ready()||window.slots[0]&&!inputMatches(window.slots[0]))throw Error('Furnace contains a different recipe');
  const existing=window.slots[0]?.count??0;
  const source=window.slots[0]||stock().find(inputMatches);
  if(source&&ready()<amount){
   const {burn,cooked,duration}=heat(),queued=window.slots[1];
   const energy=burn+cooked+(queued?.count??0)*burnTicks(queued?.name)
    +stock().filter(fuelMatches).reduce((total,item)=>total+item.count*burnTicks(item.name),0);
   const loading=Math.min(amount-ready()-existing,inventoryCount(window,item=>item.name===source.name),
    (source.stackSize??64)-existing,Math.floor(energy/duration)-existing);
   if(loading>0)await transfer(window,click,item=>item.name===source.name,0,loading,{stage:true});
  }
  const target=Math.min(collect,ready()+(window.slots[0]?.count??0));
  if(!target){
   if(source)throw Error('Missing furnace fuel');
   if(allowEmpty)return 0;
   throw Error('Missing furnace ingredient');
  }
  if(ready()<target)await fillFuel();
  const deadline=Date.now()+20000+target*10000;
  while(ready()<target){
   if(changed())throw stationError();
   if(bot.currentWindow!==window)throw windowError();
   if(Date.now()>deadline)throw Error('Furnace did not produce '+output);
   if(!window.slots[1])await fillFuel();
   await new Promise(r=>setTimeout(r,500));
  }
  const result=window.slots[2],match=item=>Item.equal(item,result,false);
  const slot=window.slots.findIndex((item,i)=>i>=window.inventoryStart&&i<window.inventoryEnd&&item&&match(item)&&item.count+result.count<=item.stackSize);
  const destination=slot>=0?slot:window.slots.findIndex((item,i)=>i>=window.inventoryStart&&i<window.inventoryEnd&&!item);
  if(destination<0)throw Error('Inventory full while collecting '+output);
  const before=inventoryCount(window,match);
  await click(2);await click(destination);
  const received=inventoryCount(window,match)-before;
  if(window.selectedItem||received<result.count)throw Error(output+' did not return to inventory');
  return received;
 }finally{
  bot._client?.removeListener?.('craft_progress_bar',onProperty);
  if(window&&bot.currentWindow===window){if(window.close)await window.close();else await bot.closeWindow(window);}
 }
}
const charcoal=(bot,block)=>smelt(bot,block);
module.exports={charcoal,smelt};

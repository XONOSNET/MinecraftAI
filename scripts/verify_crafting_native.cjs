const assert=require('node:assert/strict'),fs=require('node:fs');
const mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const {craft}=require('../controller/crafting'),{smelt}=require('../controller/furnace');
const inventory=require('../controller/inventory_sync');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const player='LabCraftCheck',b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:player,version:'1.21.4'});
inventory.attach(b);
const result={fixture:'Isolated survival player and temporary sky platform'};
const table=new Vec3(-310,210,-343),hearth=new Vec3(-310,210,-345);
let changed=false,finished=false;
async function post(data){
 for(let attempt=0;attempt<10;attempt++){
  const response=await fetch('http://127.0.0.1:8000/admin/action',{
   method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player,...data}),signal:AbortSignal.timeout(10000)
  });
  if(response.ok)return;
  const error=await response.text();
  if(!error.includes('That player is not online')||attempt===9)throw Error(error);
  await wait(750);
 }
}
async function commands(list){
 await post({action:'op'});await wait(900);
 try{for(const command of list){b.chat('/'+command);await wait(200);}await wait(650);}
 finally{await post({action:'deop'});}
}
function checkEmpty(){
 for(let x=-314;x<=-307;x++)for(let z=-348;z<=-340;z++)for(let y=209;y<=211;y++){
  assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture volume must be empty');
 }
}
const count=name=>b.inventory.items().filter(item=>item.name===name).reduce((sum,item)=>sum+item.count,0);
async function finish(){
 if(finished)return;
 finished=true;
 try{
  if(changed){
   await commands(['gamemode creative @s','clear @s','fill -314 209 -348 -307 211 -340 air']);
   checkEmpty();
  }
  await post({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});
  result.cleaned=true;
 }catch(error){result.cleanup_error=error.message;result.success=false;}
 finally{
  await post({action:'deop'}).catch(()=>{});
  fs.writeFileSync('logs/crafting-native.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));b.quit();
  setTimeout(()=>process.exit(result.success?0:1),300);
 }
}
b.on('error',error=>{result.error=error.message;result.success=false;void finish();});
b.once('spawn',async()=>{
 try{
  await wait(3500);
  await post({action:'gamemode',gamemode:'creative'});
  await post({action:'teleport-coordinates',x:-311.5,y:216,z:-344.5});await wait(1800);checkEmpty();
  changed=true;
  await commands(['fill -314 209 -348 -307 209 -340 grass_block','setblock -310 210 -343 crafting_table',
   'setblock -310 210 -345 furnace','clear @s','give @s spruce_log 8','give @s beef 5','give @s oak_planks 5',
   'tp @s -311.5 210 -344.5','gamemode survival @s']);
  await wait(500);assert.equal(b.game.gameMode,'survival');
  const clicks=[];const write=b._client.write.bind(b._client);
  b._client.write=(name,data)=>{if(name==='window_click')clicks.push([data.slot,data.mode,data.mouseButton]);return write(name,data);};
  await craft(b,'spruce_planks',4);
  assert.equal(count('spruce_log'),4);assert.equal(count('spruce_planks'),16);
  assert.equal(clicks.filter(([slot,mode])=>slot===0&&mode===1).length,1);
  result.planks={produced:16,logsRemaining:4,shiftClicks:1};
  clicks.length=0;
  await craft(b,'spruce_door',2,b.blockAt(table));
  assert.equal(count('spruce_door'),6);assert.equal(count('spruce_planks'),4);
  assert.equal(clicks.filter(([slot,mode])=>slot===0&&mode===1).length,1);
  result.doors={produced:6,planksRemaining:4,shiftClicks:1};
  clicks.length=0;
  const made=await smelt(b,b.blockAt(hearth),'beef','cooked_beef',name=>name==='oak_planks',{amount:3});
  assert.equal(made,3);assert.equal(count('cooked_beef'),3);assert.equal(count('beef'),2);assert.equal(count('oak_planks'),3);
  assert.deepEqual(clicks.filter(([slot,mode])=>[0,1].includes(slot)&&mode===0),[[0,0,0],[1,0,0]]);
  result.beef={cooked:made,rawRemaining:2,planksConsumed:2,inputAndFuelDeposits:2};
  await commands(['clear @s oak_planks','clear @s spruce_planks','give @s oak_planks 2','give @s birch_planks 1','give @s white_wool 3']);
  assert.equal(count('oak_planks'),2);assert.equal(count('birch_planks'),1);assert.equal(count('white_wool'),3);
  await craft(b,'white_bed',1,b.blockAt(table));
  assert.equal(count('white_bed'),1);assert.equal(count('oak_planks')+count('birch_planks')+count('white_wool'),0);
  result.mixedBed={produced:1,oak:2,birch:1,wool:3};
  if(process.argv.includes('--survival-progression')){
   await commands(['give @s oak_planks 12','give @s stick 4','give @s raw_iron 3']);
   const work=require('../controller/shelter_work'),t={wilderness:{},milestones:['torch'],craft:(bot,name,times,station)=>craft(bot,name,times,station)};
   const motor={pause(){}};
   for(let i=0;i<16&&(!count('iron_sword')||b.inventory.slots[45]?.name!=='shield');i++){
    const worked=await work.tick(t,b,motor,{table:b.blockAt(table),hearth:b.blockAt(hearth)});
    assert.ok(worked,t.message||'No protected job was selected');
    assert.equal(t.wilderness.shelterWork.failures,0,t.message);
   }
   assert.equal(b.inventory.slots[45]?.name,'shield');assert.equal(count('iron_sword'),1);
   assert.equal(count('raw_iron'),0);assert.ok(count('torch')>=4);
   result.protectedWork={...work.report(t,b),shieldEquipped:true,swordCrafted:true};
   await commands(['clear @s oak_planks','give @s oak_planks 3','give @s birch_planks 3','give @s iron_ingot 1']);
   await craft(b,'shield',1,b.blockAt(table));
   assert.equal(count('shield'),1);assert.equal(count('oak_planks')+count('birch_planks'),0);
   result.mixedShield=true;
  }
  result.success=true;
 }catch(error){result.error=error.stack;result.success=false;}
 finally{await finish();}
});
setTimeout(()=>{result.error='Native verification deadline';result.success=false;void finish();},process.argv.includes('--survival-progression')?155000:100000).unref();

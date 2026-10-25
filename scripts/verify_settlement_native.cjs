const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const {craft}=require('../controller/crafting'),inventory=require('../controller/inventory_sync'),{TOOLS,stockChest}=require('../controller/settlement');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSettleCheck',version:'1.21.4'});inventory.attach(b);
b.once('spawn',async()=>{const result={fixture:'Twelve logs granted only to an isolated protocol test player. Production lessons harvest all wood.'};let table,chest;
 try{
  await wait(3000);await post({action:'op',player:b.username});await wait(1000);b.chat('/clear @s');await wait(200);b.chat('/give @s oak_log 12');await wait(200);b.chat('/gamemode survival @s');await wait(600);await post({action:'deop',player:b.username});
  await post({action:'teleport-coordinates',player:b.username,x:-16.5,y:181,z:16.5});await wait(1500);
  for(const p of [new Vec3(-15,181,16),new Vec3(-17,181,18)]){const old=b.blockAt(p);if(['crafting_table','chest'].includes(old?.name))await b.dig(old);}
  await craft(b,'oak_planks',12);await craft(b,'crafting_table',1);await inventory.equip(b,'crafting_table');await b.placeBlock(b.blockAt(new Vec3(-15,180,16)),new Vec3(0,1,0));table=b.blockAt(new Vec3(-15,181,16));
  await craft(b,'chest',1,table);await inventory.equip(b,'chest');await b.placeBlock(b.blockAt(new Vec3(-17,180,18)),new Vec3(0,1,0));chest=b.blockAt(new Vec3(-17,181,18));
  for(const tool of TOOLS){if(b.inventory.items().filter(i=>i.name==='stick').reduce((n,i)=>n+i.count,0)<2)await craft(b,'stick',1);await craft(b,tool,1,table);}
  result.storedPlanks=await stockChest(b,chest,8);await inventory.equip(b,'wooden_axe');result.tools=TOOLS.filter(name=>b.inventory.items().some(i=>i.name===name));result.equipped=b.heldItem?.name;result.success=result.storedPlanks>=8&&result.tools.length===3&&result.equipped==='wooden_axe';
 }catch(error){result.error=error.message;result.inventory=b.inventory.items().map(i=>[i.name,i.count]);}
 finally{await post({action:'deop',player:b.username}).catch(()=>{});if(chest)await b.dig(chest).catch(()=>{});if(table)await b.dig(table).catch(()=>{});fs.writeFileSync('docs/settlement-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});setTimeout(()=>{b.quit();process.exit(1);},120000).unref();

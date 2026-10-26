// Isolated protocol fixture: granted ingredients are never production rewards.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const inventory=require('../controller/inventory_sync'),{craft}=require('../controller/crafting'),{harvest}=require('../controller/harvest'),{charcoal}=require('../controller/furnace');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabStoneCheck',version:'1.21.4'});inventory.attach(b);
b.once('spawn',async()=>{const result={fixture:'Isolated survival player granted logs, planks, sticks and a wooden pickaxe; actual stone mined, stone tools and furnace crafted, charcoal smelted, torch crafted and placed.'};
 try{
  await wait(2500);await post({action:'op',player:b.username});await wait(1000);
  for(const cmd of ['/kill @e[type=item,x=-20,y=180,z=15,dx=6,dy=6,dz=6]','/clear @s','/gamemode survival @s','/give @s oak_log 2','/give @s oak_planks 1','/give @s stick 3','/give @s wooden_pickaxe','/fill -19 181 19 -16 184 19 stone','/setblock -15 181 16 crafting_table','/setblock -18 181 16 air']){b.chat(cmd);await wait(250);}
  await post({action:'deop',player:b.username});await post({action:'teleport-coordinates',player:b.username,x:-17.5,y:181,z:17.5});await wait(1500);
  await inventory.equip(b,'wooden_pickaxe');result.mined=0;
  for(let y=181;y<=184;y++)for(let x=-19;x<=-16;x++)if(await harvest(b,b.blockAt(new Vec3(x,y,19))))result.mined++;
  result.removed=0;for(let y=181;y<=184;y++)for(let x=-19;x<=-16;x++)if(b.blockAt(new Vec3(x,y,19))?.name==='air')result.removed++;
  for(const z of [18.5,19.5,20.5])for(const x of [-18.5,-17.5,-16.5,-15.5]){await post({action:'teleport-coordinates',player:b.username,x,y:181,z});await wait(700);}
  await inventory.sync(b);result.cobblestone=b.inventory.items().filter(i=>i.name==='cobblestone').reduce((n,i)=>n+i.count,0);
  await post({action:'teleport-coordinates',player:b.username,x:-16.5,y:181,z:16.5});await wait(1000);
  const table=b.blockAt(new Vec3(-15,181,16));
  await craft(b,'oak_planks',1);
  for(const name of ['stone_pickaxe','stone_axe','furnace']){if(name!=='furnace'&&b.inventory.items().filter(i=>i.name==='stick').reduce((n,i)=>n+i.count,0)<2)await craft(b,'stick',1);await craft(b,name,1,table);}
  await inventory.equip(b,'furnace');await b.placeBlock(b.blockAt(new Vec3(-18,180,16)),new Vec3(0,1,0));
  await charcoal(b,b.blockAt(new Vec3(-18,181,16)));await inventory.sync(b);result.charcoal=b.inventory.items().some(i=>i.name==='charcoal');
  await craft(b,'torch',1);await inventory.equip(b,'torch');await b.placeBlock(b.blockAt(new Vec3(-16,180,17)),new Vec3(0,1,0));
  result.torch=b.blockAt(new Vec3(-16,181,17))?.name;result.tools=['stone_pickaxe','stone_axe'].every(n=>b.inventory.items().some(i=>i.name===n));result.success=result.removed===16&&result.cobblestone>=14&&result.charcoal&&result.torch==='torch'&&result.tools;
 }catch(error){result.error=error.stack;result.inventory=b.inventory.items().map(i=>[i.name,i.count]);}
 finally{
  await post({action:'op',player:b.username}).catch(()=>{});await wait(1000);
  for(const cmd of ['/fill -19 181 19 -16 184 19 air','/setblock -15 181 16 air','/setblock -18 181 16 air','/setblock -16 181 17 air']){b.chat(cmd);await wait(200);}
  await post({action:'deop',player:b.username}).catch(()=>{});fs.writeFileSync('docs/stone-age-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }
});setTimeout(async()=>{await post({action:'deop',player:b.username}).catch(()=>{});b.quit();process.exit(1);},150000).unref();

// Disposable sky fixture; no supplies or edits in production training terrain.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3'),clearance=require('../controller/construction_clearance');
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFlowerTest',auth:'offline',version:'1.21.4'}),token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={diagnostic_only:true};let changed=false;
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const message=await r.text();if(!message.includes('not online')||i===11)throw Error(message);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(700);}}finally{await admin({action:'deop'});await wait(500);}}
(async()=>{try{
 await once(b,'spawn');await wait(1500);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1399.5,y:214,z:-1399.5});await wait(1600);
 for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=209;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture starts empty');
 changed=true;await commands(['fill -1403 210 -1403 -1397 210 -1397 dirt','setblock -1402 211 -1400 crafting_table','clear @s','give @s oak_log 7','give @s cobblestone 16','tp @s -1400.5 211 -1399.5']);await admin({action:'gamemode',gamemode:'survival'});await b.waitForTicks(5);
 const {HutTeacher}=require('../controller/hut_teacher'),lighting=require('../controller/early_lighting'),craft=require('../controller/crafting').craft,inv=require('../controller/inventory_sync'),house=require('../controller/house');
 inv.attach(b);const t=new HutTeacher();Object.assign(t,{phase:'supply_craft',wilderness:{},milestones:['hut'],plot:{x:-1400,y:211,z:-1400},table:{x:-1402,y:211,z:-1400}});const motor={pause:()=>b.clearControlStates()},state={};
 await lighting.tick(t,b,motor,state);assert.equal(t.phase,'return_home');assert.equal(b.inventory.items().find(i=>i.name==='oak_log').count,4);
 t.phase='chest';await lighting.tick(t,b,motor,state);await lighting.tick(t,b,motor,state);assert.equal(t.phase,'quarry_setup');assert.ok(b.inventory.items().find(i=>i.name==='wooden_pickaxe'));
 const table=b.blockAt(new Vec3(-1402,211,-1400));for(const name of ['stone_pickaxe','stone_axe']){if(b.inventory.items().filter(i=>i.name==='stick').reduce((s,i)=>s+i.count,0)<2)await craft(b,'stick',1);await craft(b,name,1,table);}
 await craft(b,'furnace',1,table);await inv.equip(b,'furnace');const pos=house.point(t.plot,'furnace');await b._genericPlace(b.blockAt(pos.offset(0,-1,0)),new Vec3(0,1,0),{});for(let i=0;i<50&&b.blockAt(pos)?.name!=='furnace';i++)await wait(100);assert.equal(b.blockAt(pos).name,'furnace');t.phase='smelt';
 for(let i=0;i<3;i++)assert.equal(await lighting.tick(t,b,motor,state),true);
 assert.ok(b.inventory.items().filter(i=>i.name==='charcoal').reduce((s,i)=>s+i.count,0)>=3);
 t.phase='torch_craft';for(let i=0;i<8;i++){if(!await lighting.tick(t,b,motor,state))break;assert.equal(t.phase,'torch_craft');}
 report.torches=b.inventory.items().filter(i=>i.name==='torch').reduce((s,i)=>s+i.count,0);assert.ok(report.torches>=10);report.native_crafting_and_smelting=true;report.passed=true;
 }catch(error){report.error=error.stack;fs.writeFileSync('logs/early-lighting-native.json',JSON.stringify(report,null,2));process.exitCode=1;}finally{
 b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'});
 if(changed){await commands(['fill -1403 209 -1403 -1397 213 -1397 air','kill @e[type=item,x=-1403,y=-64,z=-1403,dx=6,dy=384,dz=6]','clear @s']);await wait(3000);for(let x=-1403;x<=-1397;x++)for(let z=-1403;z<=-1397;z++)for(let y=209;y<=213;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}
 await admin({action:'deop'});report.cleaned=true;b.quit();fs.writeFileSync('logs/early-lighting-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }})().then(()=>setTimeout(()=>process.exit(process.exitCode||0),200)).catch(error=>{console.error(error);b.quit();process.exit(1)});

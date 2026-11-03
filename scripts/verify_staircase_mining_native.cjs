// Isolated sky fixture only: tools are diagnostic, never given to production bots.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3');
const mine=require('../controller/staircase_mining'),inventory=require('../controller/inventory_sync');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));let changed=false;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabMineTest',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);
const result={diagnostic_only:true};
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const err=await r.text();if(!err.includes('not online')||i===11)throw Error(err);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function walk(_b,_motor,g){
 const plan=require('../controller/field_navigation').route(b,g,32,4096,true,{bounds:[-1412,-1388,-1412,-1388],reversible:true});
 if(!plan.reached)throw Error('Native fixture has no checked route to '+g);
 for(const waypoint of plan.path){
  const target=new Vec3(waypoint[0],Math.round(waypoint[1]),waypoint[2]);let arrived=false;
  for(let i=0;i<100;i++){
   const p=b.entity.position,d=Math.hypot(target.x-p.x,target.z-p.z);
   if(d<.2&&Math.abs(p.y-target.y)<.18&&b.entity.onGround){b.clearControlStates();await b.waitForTicks(4);arrived=true;break;}
   await b.look(Math.atan2(-(target.x-p.x),-(target.z-p.z)),0,true);
   b.setControlState('forward',d>=.15);b.setControlState('jump',target.y-p.y>.4);await b.waitForTicks(1);
  }
  if(!arrived){b.clearControlStates();throw Error('Native fixture walker could not reach '+target);}
 }return true;
}

async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1400,y:219,z:-1400});await wait(1800);
 for(let x=-1412;x<=-1388;x++)for(let z=-1412;z<=-1388;z++)for(let y=195;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture must start empty');
 changed=true;await commands(['fill -1412 195 -1412 -1388 208 -1388 stone','fill -1412 209 -1412 -1388 210 -1388 dirt','setblock -1396 208 -1399 coal_ore','clear @s','give @s wooden_pickaxe 1','give @s stick 4','tp @s -1399.5 211 -1399.5']);
 await admin({action:'gamemode',gamemode:'survival'});await inventory.sync(b);
 const motor={pause(){b.clearControlStates();},lockLook(){}},t={run:'native-staircase',phase:'night_stone',plot:{x:-1370,y:211,z:-1370},campPlots:[],wilderness:{},walk,harvested:0};
 t.harvest=async(_b,_m,q,_state,_api,_scan,_tasks,tool)=>{await inventory.equip(b,tool);const v=b.blockAt(q);await b.dig(v,true);assert.equal(b.blockAt(q)?.name,'air');t.harvested++;t.lastProgress=Date.now();await wait(180);};
 t.craft=async(_b,name,n)=>{await require('../controller/crafting').craft(b,name,n,null);await inventory.sync(b);};
 const state={world:{bounds:[-1410,-1390,-1410,-1390]}};const started=Date.now();
 for(let i=0;i<180&&Date.now()-started<180000;i++){await mine.tick(t,b,motor,state,null,null,null,{amount:18});await wait(80);if(t.wilderness.mine?.stage==='done')break;}
 await inventory.sync(b);const m=t.wilderness.mine;
 Object.assign(result,{seconds:(Date.now()-started)/1000,mine:mine.report(t),health:b.health,position:b.entity.position.clone().toArray(),inventory:b.inventory.items().map(i=>({name:i.name,count:i.count}))});
 assert.equal(m.stage,'done');assert.ok(b.inventory.items().filter(i=>i.name==='cobblestone').reduce((s,i)=>s+i.count,0)>=18);assert.ok(m.coal_mined>=1);assert.ok(m.torches>=1);assert.ok(Math.abs(b.entity.position.y-211)<.2);
 for(const p of m.path)assert.equal(b.blockAt(new Vec3(...p).offset(0,-1,0)).boundingBox,'block','return stairs remain intact');result.staircase_passed=true;
 // Reuse only this disposable sky fixture for a level coal vein. The target
 // plane is injected here; real-world depth selection is covered separately.
 const entry=m.entry,plane=entry[1];
 await commands([...[1,2,3].map(dx=>`setblock ${entry[0]+dx} ${plane} ${entry[2]} coal_ore`),'give @s wooden_pickaxe 1']);
 t.wilderness.mine={stage:'dig',resource:'coal',entry:[...entry],path:[[...entry]],supports:[[...entry]],target_y:plane,steps:0,lit_at:0,torches:0,coal_mined:0,dir:0,flooded:[]};
 const coalBefore=b.inventory.items().filter(i=>i.name==='coal').reduce((s,i)=>s+i.count,0),coalAt=Date.now();
 for(let i=0;i<120&&Date.now()-coalAt<60000;i++){
  await mine.tick(t,b,motor,state,null,null,null,{resource:'coal',amount:coalBefore+3});await wait(150);
  if(t.wilderness.mine.stage==='done')break;
 }
 await inventory.sync(b);const prospect=t.wilderness.mine;
 result.coal_prospect={seconds:(Date.now()-coalAt)/1000,ore_blocks:prospect.coal_mined,path:prospect.path,stage:prospect.stage,reason:prospect.reason,coal:b.inventory.items().filter(i=>i.name==='coal').reduce((s,i)=>s+i.count,0),coal_before:coalBefore};
 assert.equal(prospect.stage,'done');assert.ok(prospect.coal_mined>=3);assert.ok(prospect.path.every(p=>p[1]===plane),'coal prospecting stays level');
 assert.ok(b.inventory.items().filter(i=>i.name==='coal').reduce((s,i)=>s+i.count,0)>=coalBefore+3,'real coal drops collected');
 result.passed=true;
}catch(e){result.error=e.stack;process.exitCode=1;}finally{
 b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed){await commands(['fill -1412 195 -1412 -1388 217 -1388 air','kill @e[type=item,x=-1412,y=-64,z=-1412,dx=24,dy=384,dz=24]','kill @e[type=experience_orb,x=-1412,y=-64,z=-1412,dx=24,dy=384,dz=24]']);await wait(500);for(let x=-1412;x<=-1388;x++)for(let z=-1412;z<=-1388;z++)for(let y=195;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture cleanup verified');}
 await commands(['clear @s']);await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await admin({action:'gamemode',gamemode:'survival'});await admin({action:'deop'});result.cleaned=true;b.quit();fs.writeFileSync('logs/staircase-mining-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
main().then(()=>setTimeout(()=>process.exit(process.exitCode||0),300)).catch(e=>{console.error(e);b.quit();process.exit(1);});

// Isolated damaged-house fixture: no production terrain or inventories touched.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{once}=require('events'),{Vec3}=require('vec3');
const repair=require('../controller/home_repair'),nav=require('../controller/field_navigation'),inventory=require('../controller/inventory_sync');
const {HutTeacher}=require('../controller/hut_teacher');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));let changed=false;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabHomeTest',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);const result={diagnostic_only:true};
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();await wait(400);}throw Error('Admin unavailable');}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function walk(_b,_motor,g){
 const path=nav.route(b,g,24,4096,true,{bounds:[-1509,-1491,-1509,-1491],reversible:true});if(!path.reached)return false;
 for(const q of path.path){
  for(let i=0;i<100;i++){
   const p=b.entity.position,d=Math.hypot(q[0]-p.x,q[2]-p.z);
   if(d<.2&&Math.abs(Math.round(q[1])-p.y)<.2&&b.entity.onGround){b.clearControlStates();await b.waitForTicks(3);break;}
   await b.look(Math.atan2(-(q[0]-p.x),-(q[2]-p.z)),0,true);b.setControlState('forward',d>.14);b.setControlState('jump',q[1]-p.y>.5);await b.waitForTicks(1);
   if(i===99)throw Error('Fixture walker stalled');
  }
 }return true;
}
async function main(){try{
 await once(b,'spawn');await wait(1500);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1500,y:219,z:-1500});await wait(1500);
 for(let x=-1510;x<=-1490;x++)for(let z=-1510;z<=-1490;z++)for(let y=207;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');
 changed=true;await commands([
 'fill -1510 207 -1510 -1490 210 -1490 stone','fill -1502 210 -1502 -1498 210 -1498 oak_planks',
 'fill -1501 209 -1500 -1501 210 -1500 air','setblock -1502 211 -1498 crafting_table',
 'clear @s','give @s oak_planks 32','give @s dirt 16','give @s cobblestone 8','give @s oak_log 1','tp @s -1499.5 211 -1502.5']);
 await admin({action:'gamemode',gamemode:'survival'});await inventory.sync(b);
 const t={run:'native-partial-blast',phase:'smelt',plot:{x:-1500,y:211,z:-1500},campPlots:[],milestones:['furnace'],wilderness:{},navigator:{lastPlan:0},walk,place:HutTeacher.prototype.place,craft:async(_b,name,n,table)=>require('../controller/crafting').craft(b,name,n,table)};
 const state={world:{bounds:[-1509,-1491,-1509,-1491]}},motor={pause(){b.clearControlStates();}},started=Date.now();
 result.initial_missing=repair.inspect(t,b).missing.length;
 for(let i=0;i<150&&Date.now()-started<120000;i++){await repair.tick(t,b,motor,state);await wait(80);if(!t.homeRepair)break;}
 await inventory.sync(b);Object.assign(result,{seconds:(Date.now()-started)/1000,phase:t.phase,health:b.health,remaining:repair.inspect(t,b).missing.length,missing:repair.inspect(t,b).missing,position:b.entity.position.toArray()});
 assert.equal(t.homeRepair,null);assert.equal(result.remaining,0);assert.equal(t.phase,'smelt');assert.deepEqual(t.milestones,['furnace']);
 assert.equal(b.blockAt(new Vec3(-1501,209,-1500)).name,'dirt');assert.equal(b.blockAt(new Vec3(-1501,210,-1500)).name,'oak_planks');
 assert.equal(b.blockAt(require('../controller/house').point(t.plot,'table')).name,'crafting_table');assert.equal(b.blockAt(require('../controller/house').point(t.plot,'furnace')).name,'furnace');
 assert.equal(b.blockAt(new Vec3(-1497,211,-1500)).name,'air','future walls remain unfinished');
 await walk(b,motor,[-1499.5,211.1,-1499.5]);await require('../controller/furnace').charcoal(b,b.blockAt(require('../controller/house').point(t.plot,'furnace')));await inventory.sync(b);
 assert.equal(b.inventory.items().filter(i=>i.name==='charcoal').reduce((n,i)=>n+i.count,0),1);result.smelting_resumed=true;result.passed=true;

}catch(e){result.error=e.stack;process.exitCode=1;}finally{
 b.clearControlStates();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed){await commands(['kill @e[type=item,x=-1510,y=207,z=-1510,dx=20,dy=10,dz=20]','fill -1510 207 -1510 -1490 217 -1490 air','clear @s']);for(let x=-1510;x<=-1490;x++)for(let z=-1510;z<=-1490;z++)for(let y=207;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air');}
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5});await admin({action:'gamemode',gamemode:'survival'});await admin({action:'deop'});result.cleaned=true;b.quit();fs.writeFileSync('logs/partial-blast-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
main().then(()=>setTimeout(()=>process.exit(process.exitCode||0),300)).catch(e=>{console.error(e);b.quit();process.exit(1);});

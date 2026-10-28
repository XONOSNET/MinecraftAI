// Isolated two-high leaf barrier and real item pickups, using the shared motor.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBodyCheck',version:'1.21.4'}),result={fixture:'Isolated sky platform; two-high leaf barrier, elevated real wood drop, then a drop on leaves. No learning writes or production inventory grants.',cases:[]};inventory.attach(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(250);}
const count=()=>b.inventory.items().filter(i=>i.name==='oak_log').reduce((n,i)=>n+i.count,0);
b.once('spawn',async()=>{let built=false;try{
 await wait(1600);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-82.5,y:240,z:160.5});await wait(1200);
 for(let x=-84;x<=-76;x++)for(let y=239;y<=247;y++)for(let z=157;z<=163;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;await cmd('fill -84 239 157 -76 239 163 stone');await cmd('fill -80 240 157 -80 241 163 oak_leaves[persistent=true]');await cmd('setblock -79 240 160 stone');await cmd('fill -78 240 160 -78 241 160 stone');await cmd('summon item -77.5 242.2 160.5 {Tags:["lab_body_fixture"],Item:{id:"minecraft:oak_log",count:1}}');await admin({action:'deop'});
 const state={run:'diagnostic-only',world:{bounds:[-90,-70,150,170],driver:'student'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected diagnostic write');return {action:data.teacher};};
 async function collect(label,expected){
  motor.pause();await admin({action:'teleport-coordinates',x:label.startsWith('elevated')?-80.3:-82.5,y:240,z:160.5});survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(400);await b.look(-Math.PI/2,0,true);
  const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:null,campPlots:[],resourceAccess:{},ignoredDrops:new Map(),runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
  const at=Date.now(),messages=[];while(Date.now()-at<20000&&count()<expected){
   const drop=Object.values(b.entities).find(e=>e.name==='item'&&e.isValid!==false&&e.position.y>239&&e.position.x>-84&&e.position.x<-76&&require('../controller/survival').itemName(b,e)==='oak_log');
   if(drop)await t.collectWood(b,motor,drop,state,api,scan,tasks);else motor.pause();
   if(messages.at(-1)!==t.message)messages.push(t.message);await wait(75);
  }
  motor.pause();return {label,collected:count()>=expected,inventory_logs:count(),seconds:(Date.now()-at)/1000,position:b.entity.position.clone(),cleared:t.resourceAccess.bodyCleared||0,messages};
 }
 result.cases.push(await collect('elevated wood beyond a leaf barrier and stone steps',1));
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-82.5,y:240,z:160.5});await wait(400);
 await admin({action:'op'});await wait(1000);await cmd('setblock -79 240 160 air');await cmd('setblock -78 241 160 air');await cmd('setblock -78 240 160 oak_leaves[persistent=true]');await cmd('summon item -77.5 241.2 160.5 {Tags:["lab_body_fixture"],Item:{id:"minecraft:oak_log",count:1}}');await admin({action:'deop'});
 result.cases.push(await collect('wood resting on foliage must fall into reach',2));
 result.barrier_head=b.blockAt(new Vec3(-80,241,160))?.name;result.barrier_feet=b.blockAt(new Vec3(-80,240,160))?.name;result.success=result.cases.every(c=>c.collected)&&result.cases[0].position.y>240.9&&result.cases[1].cleared>0&&result.barrier_head==='air'&&result.barrier_feet==='air';
 }catch(error){result.error=error.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(1000);await cmd('kill @e[type=item,x=-84,y=239,z=157,dx=8,dy=9,dz=6]');await cmd('fill -84 239 157 -76 247 163 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/body-pickup-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
 }});setTimeout(async()=>{await admin({action:'deop'}).catch(()=>{});b.quit();process.exit(1);},90000).unref();

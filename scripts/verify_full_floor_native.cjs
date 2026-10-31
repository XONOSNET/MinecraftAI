// Full 25-tile floor, actual survival digging/placement, temporary isolated fixture.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFullFloor',version:'1.21.4'});inventory.attach(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});b.on('physicsTick',()=>motor.tick());
const report={fixture:'All 25 dirt/grass floor tiles replaced by real planks in survival; adjacent ground and outside fern preserved. No training writes.'};let created=false,op=false;
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Diagnostic unavailable');}
async function cmd(text){b.chat('/'+text);await wait(250);}
b.once('spawn',async()=>{try{
 await wait(1400);survey.hold(b);await admin({action:'gamemode',gamemode:'survival'});await admin({action:'op'});op=true;await wait(500);
 await admin({action:'teleport-coordinates',x:-80.5,y:180,z:157.5});await wait(1200);
 for(let x=-88;x<=-74;x++)for(let z=150;z<=166;z++)for(let y=178;y<=184;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Owned fixture is not empty sky');
 created=true;for(const c of ['fill -88 178 150 -74 178 166 stone','fill -88 179 150 -74 179 166 grass_block','setblock -77 180 158 large_fern[half=lower]','setblock -77 181 158 large_fern[half=upper]','clear @s','give @s oak_planks 40'])await cmd(c);
 survey.release(b);await wait(500);const t=new HutTeacher();Object.assign(t,{phase:'floor',plot:{x:-81,y:180,z:158},campPlots:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),lastProgress:Date.now()});
 const state={run:'native-floor-only',world:{bounds:[-90,-72,148,168],driver:'teacher'}},api=async(path,d)=>{if(path!=='/step')throw Error('Unexpected diagnostic write');return {action:d.teacher};};
 const start=Date.now();while(t.phase==='floor'&&Date.now()-start<75000){await t.buildFloor(b,motor,state,api,scan,tasks);await wait(75);}
 report.phase=t.phase;report.seconds=(Date.now()-start)/1000;report.message=t.message;report.position=b.entity.position.clone();report.navigation=t.lastNavigation;report.tiles=0;
 for(let x=-83;x<=-79;x++)for(let z=156;z<=160;z++)if(b.blockAt(new Vec3(x,179,z))?.name==='oak_planks')report.tiles++;
 report.surrounding_ground=b.blockAt(new Vec3(-78,179,158))?.name;report.outside_fern=b.blockAt(new Vec3(-77,180,158))?.name;
 report.health=b.health;report.success=t.phase==='table'&&report.tiles===25&&report.surrounding_ground==='grass_block'&&report.outside_fern==='large_fern'&&report.health===20;
 }catch(e){report.error=e.stack;}finally{
  motor.pause();survey.release(b);await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});await wait(300);
  if(created){await cmd('kill @e[type=item,x=-88,y=178,z=150,dx=14,dy=7,dz=16]');await cmd('fill -88 178 150 -74 184 166 air');await cmd('clear @s');}
  if(op)await admin({action:'deop'}).catch(()=>{});
  fs.writeFileSync('logs/full-floor-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));b.quit();setTimeout(()=>process.exit(report.success?0:1),250);
 }});

// Isolated native bootstrap reproduction; no production inventory or learning writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),night=require('../controller/first_night'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBenchCheck',version:'1.21.4'}),result={fixture:'Isolated sky platform; bootstrap using actual crafting and placement.'};inventory.attach(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(250);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1600);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.4703,y:240,z:162.0523});await wait(1200);
 for(let x=-85;x<=-75;x++)for(let y=239;y<=244;y++)for(let z=156;z<=165;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;await cmd('fill -85 239 156 -75 239 165 grass_block');await cmd('give @s oak_log 5');await admin({action:'deop'});
 survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(400);
 const t=new HutTeacher();Object.assign(t,{phase:'night_bootstrap',plot:{x:-79,y:240,z:160},campPlots:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
 const state={run:'diagnostic-only',world:{mission:'first_night',bounds:[-90,-70,150,170],driver:'student',first_night:{}}};night.init(t,state.world);
 const api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected write');return {action:data.teacher};};
 const at=Date.now();while(Date.now()-at<40000&&t.phase==='night_bootstrap'){await night.tick(t,b,motor,state,api,scan,tasks);await wait(100);}
 result.success=t.phase==='gather'&&b.blockAt(new Vec3(-82,240,161))?.name==='crafting_table'&&b.inventory.items().some(i=>i.name==='wooden_axe');result.seconds=(Date.now()-at)/1000;result.position=b.entity.position.clone();result.phase=t.phase;
 }catch(error){result.error=error.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(1000);await cmd('kill @e[type=item,x=-85,y=239,z=156,dx=10,dy=5,dz=9]');await cmd('fill -85 239 156 -75 244 165 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/workbench-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
 }});setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

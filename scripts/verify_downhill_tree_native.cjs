// Real downhill tree scan, selection, descent and climb back on an isolated fixture.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),resourceScan=require('../controller/resource_scan'),{chooseTree}=require('../controller/tree_target'),{surface}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabDownhillCheck',version:'1.21.4'}),result={fixture:'Isolated 12-block hillside; actual loaded scan, safe tree selection, descent and climb home. No learning writes.'};inventory.attach(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(250);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1600);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-85.5,y:240,z:160.5});await wait(1200);
 for(let x=-88;x<=-64;x++)for(let y=227;y<=244;y++)for(let z=157;z<=163;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;
 for(let x=-88;x<=-64;x++){const h=240-Math.min(12,Math.max(0,x+84));await cmd(`fill ${x} 227 157 ${x} ${h-1} 163 stone`);}
 await cmd('fill -68 228 160 -68 230 160 oak_log');await admin({action:'deop'});
 survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(400);
 const bounds=[-90,-62,155,165],at=Date.now(),old=await resourceScan.logs(b,{minDy:-5,bounds}),found=await resourceScan.logs(b,{bounds});
 result.old_scan=old.length;result.new_scan=found.length;result.scan_ms=Date.now()-at;
 // Production world trials end at Y191; this fixture sits above them in empty sky.
 const fixtureSurface=(bot,x,z)=>{const y=240-Math.min(12,Math.max(0,x+84));return require('../controller/field_navigation').standable(bot,x,y,z)?y:null;};
 const target=chooseTree(b,found,null,fixtureSurface,'diagnostic-only');result.tree=target.key;result.approach=target.approach;
 if(!target.key)throw Error('Downhill tree was not selected');
 const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:null,campPlots:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
 const state={run:'diagnostic-only',world:{bounds,driver:'student'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected write');return {action:data.teacher};};
 async function travel(goal){const start=Date.now();let arrived=false;while(Date.now()-start<20000&&!arrived){arrived=await t.walk(b,motor,goal,state,api,scan,tasks)===true;await wait(50);}motor.pause();return {arrived,seconds:(Date.now()-start)/1000,position:b.entity.position.clone()};}
 result.downhill=await travel(target.approach);result.return_home=await travel([-85.5,240.1,160.5]);
 result.success=old.length===0&&found.length===3&&result.downhill.arrived&&result.return_home.arrived;
 }catch(error){result.error=error.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(1000);await cmd('kill @e[type=item,x=-88,y=227,z=157,dx=24,dy=17,dz=6]');await cmd('fill -88 227 157 -64 244 163 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/downhill-tree-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
 }});setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

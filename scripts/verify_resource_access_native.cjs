// Isolated survival fixture above empty sky; never writes examples or bot resources.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),access=require('../controller/resource_access'),inventory=require('../controller/inventory_sync'),{harvest}=require('../controller/harvest'),{harvestable}=require('../controller/resource_target');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabAccessCheck',version:'1.21.4'});inventory.attach(b);
const result={fixture:'Temporary survival-only dirt/leaf obstruction and three-block jump placement; isolated sky platform, no learning writes'},motor=require('../controller/locomotion').createMotor(b,{move:true,turn:true,jump:true,sprint:true});
b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Diagnostic player unavailable');}
async function command(text){b.chat('/'+text);await wait(250);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1800);require('../controller/survey').hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:240,z:160.5});await wait(1500);
 if(process.argv.includes('--cleanup-stale')){await admin({action:'op'});await wait(1000);await command('fill -84 239 157 -76 252 163 air');await admin({action:'deop'});}
 for(let x=-84;x<=-76;x++)for(let y=239;y<=252;y++)for(let z=157;z<=163;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture volume must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;await command('fill -84 239 157 -76 239 163 stone');await command('setblock -78 241 160 oak_log');await command('setblock -79 241 160 dirt');await command('give @s dirt 8');await command('give @s wooden_axe');await admin({action:'deop'});await admin({action:'teleport-coordinates',x:-80.5,y:240,z:160.5});require('../controller/survey').release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(700);result.start=b.entity.position.clone();result.items=b.inventory.items().map(i=>i.name);
 const state={};if(!process.argv.includes('--step-only')){result.dirt=await access.attempt(b,motor,new Vec3(-78,241,160),{state,run:'diagnostic-only'});
 await admin({action:'op'});await wait(1000);await command('setblock -79 241 160 oak_leaves');await admin({action:'deop'});
 result.leaves=await access.attempt(b,motor,new Vec3(-78,241,160),{state,run:'diagnostic-only'});
 result.minerals=[];
 await admin({action:'op'});await wait(1000);await command('give @s stone_pickaxe');await admin({action:'deop'});
 for(const name of ['stone','coal_ore','iron_ore']){
  await admin({action:'op'});await wait(1000);await command('setblock -78 241 160 '+name);await command('setblock -79 241 160 dirt');await admin({action:'deop'});
  const cleared=await access.attempt(b,motor,new Vec3(-78,241,160),{state:{},run:'diagnostic-only'});
  await inventory.equip(b,'stone_pickaxe');const reachable=harvestable(b,new Vec3(-78,241,160)),mined=reachable&&await harvest(b,b.blockAt(new Vec3(-78,241,160)));
  result.minerals.push({name,cleared:!!cleared.progress,reachable,mined});
 }}
 // A visible trunk is already in reach from below the ledge. Follow the
 // elevated harvesting stance through the real route motor before digging.
 await admin({action:'op'});await wait(1000);await command('setblock -80 240 160 stone');await command('setblock -79 241 160 oak_log');await admin({action:'deop'});
 await admin({action:'teleport-coordinates',x:-81.5,y:240,z:160.5});await wait(350);
 const {HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),tasks=require('../controller/tasks'),{scan}=require('../controller/perception');
 const t=new HutTeacher();Object.assign(t,{phase:'gather',plot:null,campPlots:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now())});
 const stepGoal=[-79.5,241.1,160.5],at=Date.now();let arrived=false;const samples=[];
 while(Date.now()-at<10000&&!arrived){arrived=await t.walk(b,motor,stepGoal,{run:'diagnostic-only',world:{bounds:[-90,-70,150,170],driver:'student'}},async(path,data)=>{if(path!=='/step')throw Error('Unexpected diagnostic write');return {action:data.teacher};},scan,tasks)===true;if(samples.length<8)samples.push({position:b.entity.position.clone(),navigation:t.lastNavigation});await wait(50);}
 motor.pause();result.step_up={arrived,seconds:(Date.now()-at)/1000,y:b.entity.position.y,position:b.entity.position.clone()};
 if(!arrived)Object.assign(result.step_up,{navigation:t.lastNavigation,samples});
 await admin({action:'op'});await wait(1000);await command('fill -82 240 157 -76 245 163 air');await admin({action:'deop'});await admin({action:'teleport-coordinates',x:-80.5,y:240,z:160.5});await wait(400);
 if(!process.argv.includes('--step-only')){await admin({action:'op'});await wait(1000);await command('setblock -78 241 160 air');await command('setblock -80 247 160 oak_log');await command('setblock -80 248 160 oak_log');await admin({action:'deop'});
 const target=new Vec3(-80,248,160),column={};result.steps=[];
 await admin({action:'teleport-coordinates',x:-80.2,y:240,z:160.5});await wait(350);
 result.centering=await access.attempt(b,motor,new Vec3(-80,247,160),{state:column,run:'diagnostic-only'});result.centered_position=b.entity.position.clone();
 for(let i=0;i<2;i++){
  result.steps.push(await access.attempt(b,motor,new Vec3(-80,247,160),{state:column,run:'diagnostic-only'}));await wait(300);
 }
 const top=column.column.at(-1).position;await admin({action:'teleport-coordinates',x:top.x+.72,y:top.y+1,z:top.z+.5});await wait(350);result.recentered=await access.recoverColumn(b,motor,column);result.recentered_position=b.entity.position.clone();
 await inventory.equip(b,'wooden_axe');result.height=b.entity.position.y;result.reachable=harvestable(b,new Vec3(-80,247,160));result.harvested=await harvest(b,b.blockAt(new Vec3(-80,247,160)));
 result.descents=[];while(column.column?.length){result.descents.push(await access.descend(b,motor,column));await wait(300);}result.return_y=b.entity.position.y;
 }result.success=result.step_up?.arrived&&(process.argv.includes('--step-only')||result.minerals.every(q=>q.cleared&&q.reachable&&q.mined)&&result.recentered&&result.centering.progress&&Math.abs(result.centered_position.x+80.5)<.15&&result.dirt.progress&&result.leaves.progress&&result.steps.every(s=>s.progress)&&result.reachable&&result.harvested&&Math.abs(result.return_y-240)<.15);
 }catch(error){result.error=error.stack;}finally{
 motor.pause();require('../controller/survey').hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(1000);await command('kill @e[type=item,x=-84,y=239,z=157,dx=8,dy=14,dz=6]');await command('fill -84 239 157 -76 252 163 air');await command('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
 fs.writeFileSync('docs/resource-access-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }});
setTimeout(async()=>{result.error='Diagnostic timed out';await admin({action:'deop'}).catch(()=>{});b.quit();process.exit(1);},90000).unref();

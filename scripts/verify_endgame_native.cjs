// Isolated native bootstrap reproduction; no production inventory or learning writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher,surface}=require('../controller/hut_teacher'),night=require('../controller/first_night'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabEndgameTest',version:'1.21.4'}),result={fixture:'Isolated house, real adult sheep wool collection, then observed-resource scouting and physical return. No production resources or learning writes.'};inventory.attach(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(250);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1600);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-79.5,y:180,z:154.5});await wait(1200);
 if(process.argv.includes('--cleanup-stale')){await admin({action:'op'});await wait(1000);await cmd('kill @e[tag=lab_endgame_fixture]');await cmd('kill @e[type=item,x=-88,y=179,z=150,dx=33,dy=6,dz=18]');await cmd('fill -88 179 150 -55 185 168 air');await admin({action:'deop'});}
 for(let x=-88;x<=-55;x++)for(let y=179;y<=185;y++)for(let z=150;z<=168;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;
 await cmd('fill -88 179 150 -55 179 168 stone');
 for(const c of ['fill -88 180 150 -55 181 150 glass','fill -88 180 168 -55 181 168 glass','fill -88 180 150 -88 181 168 glass','fill -55 180 150 -55 181 168 glass','fill -83 179 157 -77 179 163 oak_planks','fill -83 180 157 -77 183 163 oak_planks hollow','fill -82 180 158 -78 180 162 air','setblock -80 180 157 oak_door[facing=north,half=lower,hinge=left]','setblock -80 181 157 oak_door[facing=north,half=upper,hinge=left]','fill -65 180 154 -65 182 154 oak_log','clear @s','give @s stone_axe'])await cmd(c);
 for(let i=0;i<3;i++)await cmd(`summon sheep ${-72+i*3}.5 180 154.5 {Tags:["lab_endgame_fixture"],Color:0b,Age:0,PersistenceRequired:1b}`);
 await admin({action:'deop'});survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(500);
 const t=new HutTeacher();Object.assign(t,{phase:'night_wool',plot:{x:-80,y:180,z:160},campPlots:[{x:-80,y:180,z:160}],milestones:[],runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),started:Date.now(),lastProgress:Date.now()});
 const state={run:'diagnostic-only',world:{mission:'first_night',bounds:[-90,-53,148,170],driver:'student',first_night:{stations:false,hold_seconds:180}}};night.init(t,state.world);
 const log=b.blockAt(new Vec3(-65,180,154));if(log?.name!=='oak_log')throw Error('Real resource landmark missing');t.wilderness.memory.remember('wood',log.position);
 const api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected write');return {action:data.teacher};};
 let start=Date.now();while(t.phase==='night_wool'&&Date.now()-start<50000){await night.tick(t,b,motor,state,api,scan,tasks,surface);await wait(75);}
 result.wool={completed:t.phase==='night_wool_home',seconds:(Date.now()-start)/1000,count:b.inventory.items().filter(i=>i.name==='white_wool').reduce((n,i)=>n+i.count,0),phase:t.phase,message:t.message};
 motor.pause();t.phase='night_scout';start=Date.now();
 while(t.phase!=='night_hold'&&Date.now()-start<30000){await night.tick(t,b,motor,state,api,scan,tasks,surface);await wait(75);}
 result.scout={completed:t.phase==='night_hold'&&t.milestones.includes('round_trip'),seconds:(Date.now()-start)/1000,phase:t.phase,navigation:t.lastNavigation,position:b.entity.position.clone(),goal:t.wilderness.scoutGoal,resources:t.wilderness.memory.resources};
 result.success=result.wool.completed&&result.wool.count>=3&&result.scout.completed;
 }catch(error){result.error=error.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(1000);await cmd('kill @e[tag=lab_endgame_fixture]');await cmd('kill @e[type=item,x=-88,y=179,z=150,dx=33,dy=6,dz=18]');await cmd('fill -88 179 150 -55 185 168 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/endgame-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
 }});setTimeout(()=>{b.quit();process.exit(1);},115000).unref();

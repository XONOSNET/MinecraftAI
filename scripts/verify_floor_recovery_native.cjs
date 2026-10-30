// Isolated native regression: main-inventory axe -> held axe -> actual sheep hits.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldTiming}=require('../controller/world_timing'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFloorCheck',version:'1.21.4'}),result={fixture:'Isolated floor and temporary blocking armor stand; no production learning writes.'};inventory.attach(b);const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Diagnostic unavailable');}
async function cmd(c){b.chat('/'+c);await wait(350);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1400);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:180,z:158.5});await wait(1300);
 for(let x=-88;x<=-55;x++)for(let y=176;y<=185;y++)for(let z=150;z<=168;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky: '+[x,y,z,b.blockAt(new Vec3(x,y,z))?.name].join(','));
 await admin({action:'op'});await wait(600);built=true;
 for(const c of ['fill -88 178 150 -55 179 168 sea_lantern','fill -83 179 156 -79 179 160 oak_planks','setblock -80 179 158 air','clear @s','give @s oak_planks 8','summon armor_stand -79.5 179 158.5 {NoGravity:1b,Invisible:1b,Tags:["lab_floor_fixture"]}'])await cmd(c);
 await inventory.sync(b);survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(600);
 const t=new HutTeacher();Object.assign(t,{runtime:tasks.createRuntime(),phase:'floor',plot:{x:-81,y:180,z:158},timing:new WorldTiming(Date.now()),started:Date.now(),lastProgress:Date.now(),milestones:[]});
 const state={run:'floor-native-fixture',world:{bounds:[-90,-53,148,170],driver:'teacher'}},api=async(path,data)=>{if(path!=='/step')throw Error('Unexpected diagnostic write');return {action:data.teacher};};
 await t.buildFloor(b,motor,state,api,scan,tasks);
 result.rejection={retried:!!t.floorRecovery,refusals:t.floorRecovery?.refusals,message:t.message};
 if(!t.floorRecovery)throw Error('Expected a native placement rejection caused by fixture stand');
 await cmd('kill @e[tag=lab_floor_fixture]');await wait(300);
 const at=Date.now();while(t.phase==='floor'&&Date.now()-at<25000){await t.buildFloor(b,motor,state,api,scan,tasks);await wait(80);}
 result.recovery={phase:t.phase,block:b.blockAt(new Vec3(-80,179,158))?.name,seconds:(Date.now()-at)/1000};
 result.success=result.recovery.block==='oak_planks'&&t.phase==='table';if(!result.success)throw Error('Floor recovery did not finish');

}catch(e){result.error=e.stack;}finally{
 motor.pause();survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(600);await cmd('kill @e[tag=lab_floor_fixture]');await cmd('kill @e[type=item,x=-88,y=176,z=150,dx=33,dy=10,dz=18]');await cmd('fill -88 176 150 -55 185 168 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/floor-recovery-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
}});

// Isolated real hostile combat. Setup supplies belong only to this diagnostic player.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events');
const defense=require('../controller/survival_defense'),inventory=require('../controller/inventory_sync'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),result={};let changed=false,motor;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabDefenseTest',auth:'offline',version:'1.21.4'});inventory.attach(b);b.on('error',console.error);b.on('physicsTick',()=>motor?.tick());
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function main(){try{
 await once(b,'spawn');await wait(2000);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1000,y:220,z:-1000});await wait(2000);
 for(let x=-1007;x<=-993;x++)for(let z=-1007;z<=-993;z++)for(let y=209;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture must be empty');
 changed=true;await commands(['fill -1007 210 -1007 -993 210 -993 stone','fill -1007 215 -1007 -993 215 -993 stone','clear @s','give @s wooden_axe','tp @s -999.5 211 -999.5','summon zombie -999.5 211 -1002 {PersistenceRequired:1b,Tags:["lab_defense_fixture"]}']);
 const zombie=Object.values(b.entities).find(e=>e.name==='zombie'&&e.position.distanceTo(b.entity.position)<5);assert.ok(zombie,'fixture zombie spawned');
 let dead=false;b.on('entityDead',e=>{if(e.id===zombie.id)dead=true;});
 await admin({action:'gamemode',gamemode:'survival'});await wait(250);motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});
 const t={phase:'gather',milestones:[],wilderness:{},lastProgress:Date.now()},state={run:'native-defense-only',world:{bounds:[-1008,-992,-1008,-992],first_night:{hostiles:true}}};
 const api=async(path,data)=>{assert.equal(path,'/step');assert.equal(data.world_skill,'combat');return {action:data.teacher};},started=Date.now();
 while(!dead&&b.health>0&&Date.now()-started<18000){await defense.tick(t,b,motor,state,api,scan);await wait(75);}
 result.seconds=(Date.now()-started)/1000;result.hits=t.wilderness.defense?.hits||0;result.zombie_dead=dead;result.health=b.health;result.mode=b.game.gameMode;result.phase=t.phase;result.zombie={position:zombie.position.clone(),valid:zombie.isValid};
 assert.ok(dead,'actual zombie defeated');assert.ok(result.hits>=2,'consecutive cooldown-governed hits');assert.ok(b.health>0,'diagnostic survived');assert.equal(result.mode,'survival');assert.equal(t.phase,'gather');result.passed=true;
}catch(error){result.error=error.message;throw error;}finally{
 motor?.pause();await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed)await commands(['kill @e[tag=lab_defense_fixture]','kill @e[type=item,x=-1007,y=209,z=-1007,dx=14,dy=8,dz=14]','kill @e[type=experience_orb,x=-1007,y=209,z=-1007,dx=14,dy=8,dz=14]','fill -1007 209 -1007 -993 217 -993 air']);
 if(changed)for(let x=-1007;x<=-993;x++)for(let z=-1007;z<=-993;z++)for(let y=209;y<=217;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture cleanup verified');
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
 await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});result.cleaned=true;b.quit();fs.writeFileSync('logs/survival-defense-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{motor?.pause();b.quit();process.exitCode=1;},90000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});

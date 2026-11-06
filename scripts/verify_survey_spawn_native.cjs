// Isolated setup transition: terrain-height spectator survey, then checked survival ground.
const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),{once}=require('events'),{execFileSync}=require('child_process'),survey=require('../controller/survey');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),result={};let changed=false;
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSpawnTest',auth:'offline',version:'1.21.4'});b.on('error',console.error);b.on('physicsTick',()=>survey.hold(b));
async function admin(data){for(let i=0;i<12;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const error=await r.text();if(!error.includes('not online')||i===11)throw Error(error);await wait(500);}}
async function commands(list){await admin({action:'op'});await wait(1000);try{for(const c of list){b.chat('/'+c);await wait(800);}}finally{await admin({action:'deop'});await wait(500);}}
async function main(){try{
 await once(b,'spawn');await wait(1500);await admin({action:'gamemode',gamemode:'creative'});await admin({action:'teleport-coordinates',x:-1345,y:224,z:-1345});await wait(1500);await b.waitForChunksToLoad();
 for(let x=-1350;x<=-1340;x++)for(let z=-1350;z<=-1340;z++)for(let y=205;y<=224;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture must be empty');
 changed=true;await commands(['fill -1350 210 -1350 -1340 210 -1340 dirt','fill -1345 211 -1345 -1345 215 -1345 oak_log','fill -1347 216 -1347 -1343 218 -1343 oak_leaves[persistent=true]']);
 const setup=JSON.parse(execFileSync('.venv/Scripts/python.exe',['-c',"import json;from lab.world_training import survey_commands;print(json.dumps(survey_commands('LabSpawnTest',-1344.5,-1344.5)))"],{encoding:'utf8'}));
 await commands(setup);assert.equal(b.game.gameMode,'spectator');
 const start=b.entity.position.clone();result.survey_position=start.toArray();assert.ok(start.y>=217&&start.y<=221,'survey follows terrain height instead of fixed sky height');
 await wait(1500);result.survey_displacement=b.entity.position.distanceTo(start);assert.ok(result.survey_displacement<.1,'no gravity-driven descent onto canopy');
 result.survey_position=start.toArray();const ground=new Vec3(-1349,211,-1349);assert.equal(b.blockAt(ground.offset(0,-1,0)).name,'dirt');assert.ok(require('../controller/field_navigation').standable(b,ground.x,ground.y,ground.z));
 await commands(['tp @s -1348.5 211.1 -1348.5','gamemode survival @s']);await wait(500);
 assert.equal(b.game.gameMode,'survival');assert.equal(b.entity.onGround,true);assert.equal(b.entity.position.y,211);assert.equal(b.physics.gravity,.08);assert.equal(b.health,20);assert.equal(b.inventory.items().length,0);
 result.ground_position=b.entity.position.toArray();result.normal_gravity_restored=true;result.no_starting_items=true;result.passed=true;
}finally{
 await admin({action:'gamemode',gamemode:'creative'}).catch(()=>{});
 if(changed){await admin({action:'teleport-coordinates',x:-1345,y:224,z:-1345});await commands(['fill -1350 205 -1350 -1340 224 -1340 air','kill @e[type=item,x=-1350,y=205,z=-1350,dx=10,dy=19,dz=10]']);for(let x=-1350;x<=-1340;x++)for(let z=-1350;z<=-1340;z++)for(let y=205;y<=224;y++)assert.equal(b.blockAt(new Vec3(x,y,z))?.name,'air','fixture cleaned');result.cleaned=true;}
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});await admin({action:'gamemode',gamemode:'survival'}).catch(()=>{});await admin({action:'deop'}).catch(()=>{});survey.release(b);b.quit();fs.writeFileSync('logs/survey-spawn-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}}
const timer=setTimeout(()=>{b.quit();process.exitCode=1;},90000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timer);setTimeout(()=>process.exit(process.exitCode||0),300);});

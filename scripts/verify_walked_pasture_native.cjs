// Isolated sky fixture; verifies server selectors, heightmap syntax and caps.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabPastureChk',version:'1.21.4'}),result={fixture:'Conditional walked-pasture grass spawns; cap four sheep, wave budget two; no production inventory or model writes'},messages=[];
b.on('messagestr',s=>messages.push(s));
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Observer unavailable');}
async function cmd(c){b.chat('/'+c);await wait(180);}
const count=()=>Object.values(b.entities).filter(e=>['sheep','cow','pig','chicken'].includes(e.name)&&e.isValid!==false&&e.position.y>=179&&e.position.y<188).length;
b.once('spawn',async()=>{let built=false;try{
 await wait(1500);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:180,z:160.5});await wait(1200);
 for(let x=-84;x<=-76;x++)for(let y=179;y<=187;y++)for(let z=157;z<=163;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(1000);built=true;await cmd('fill -84 179 157 -76 179 163 grass_block');await admin({action:'teleport-coordinates',x:-95.5,y:180,z:160.5});await wait(400);
 const commands=JSON.parse(fs.readFileSync('logs/walked-pasture-fixture.json','utf8'));
 for(const c of commands)await cmd(c);await wait(400);result.first_wave=count();
 await cmd('execute as @e[tag=lab_fauna_fixture] run data merge entity @s {NoAI:1b}');
 for(const c of commands)await cmd(c);await wait(400);result.second_wave=count();
 for(const c of commands)await cmd(c);await wait(400);result.capped_wave=count();await cmd('kill @e[tag=lab_fauna_fixture]');await wait(200);await cmd('fill -84 179 157 -76 179 163 stone');
 for(const c of commands)await cmd(c);await wait(400);result.unsafe_wave=count();
 result.success=result.first_wave===2&&result.second_wave===4&&result.capped_wave===4&&result.unsafe_wave===0;
 }catch(error){result.error=error.stack;}finally{
 if(built){await cmd('kill @e[tag=lab_fauna_fixture]');await cmd('kill @e[type=item,x=-90,y=179,z=150,dx=20,dy=9,dz=20]');await cmd('fill -84 179 157 -76 187 163 air');for(const mob of ['sheep','cow','pig','chicken'])await cmd('scoreboard players reset #fauna_'+mob+' lab_world');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();
 if(!result.success)result.messages=messages.slice(-35);fs.writeFileSync('docs/walked-pasture-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
 }});setTimeout(async()=>{await admin({action:'deop'}).catch(()=>{});b.quit();process.exit(1);},60000).unref();

// Isolated native regression for sheep birth counting and replenishment caps.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabFaunaCheck',version:'1.21.4'}),result={fixture:'Isolated grassy sky fixture: successful sheep births, wave limit and population cap. No production resources modified.'};inventory.attach(b);
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Diagnostic unavailable');}
async function cmd(c){b.chat('/'+c);await wait(150);}
const messages=[];b.on('messagestr',s=>messages.push(s));
b.once('spawn',async()=>{let built=false;try{
 await wait(1400);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:190,z:158.5});await wait(2200);
 for(let x=-88;x<=-55;x++)for(let y=176;y<=185;y++)for(let z=150;z<=168;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(600);built=true;
 await cmd('fill -88 179 150 -55 179 168 grass_block');
 const waves=JSON.parse(require('child_process').execFileSync('.venv/Scripts/python.exe',['-c',"import json; from lab.world_fauna import replenish_commands; print(json.dumps([replenish_commands([-88,-55,148,172],[],w,dict(sheep=3),[(-84,180,153),(-72,180,158),(-60,180,163)]) for w in range(3)]))"]).toString());result.waves=[];
 for(const commands of waves){const start=messages.length;for(const c of commands)await cmd(c);await wait(400);
  const output=messages.slice(start).join('\n'),births=[...output.matchAll(/#fauna_wave_sheep has (\d+) /g)].pop(),population=[...output.matchAll(/#fauna_sheep has (\d+) /g)].pop();
  if(!births||!population)throw Error('Native sheep count acknowledgement missing: '+output);
  result.waves.push({births:Number(births[1]),population:Number(population[1])});
 }
 result.success=JSON.stringify(result.waves)===JSON.stringify([{births:2,population:2},{births:1,population:3},{births:0,population:3}]);
 if(!result.success)throw Error('Unexpected native wave or population counts');

}catch(e){result.error=e.stack;}finally{
 survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(600);await cmd('kill @e[type=minecraft:sheep,x=-88,y=176,z=150,dx=33,dy=10,dz=18]');await cmd('kill @e[type=item,x=-88,y=176,z=150,dx=33,dy=10,dz=18]');await cmd('fill -88 176 150 -55 185 168 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/fauna-distribution-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
}});

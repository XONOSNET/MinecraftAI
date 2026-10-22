const fs=require('fs'),assert=require('assert/strict'),mineflayer=require('mineflayer');const {once}=require('events');const {Vec3}=require('vec3');
const token=fs.readFileSync('data/api-token','utf8').trim(),name='LabViewProbe';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function status(){return(await fetch('http://127.0.0.1:8000/status')).json();}
async function post(path,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});const out=await r.json();if(!r.ok)throw Error(JSON.stringify(out));return out;}
(async()=>{let bot;try{
 const initial=await status();assert.equal(initial.mode,'paused');assert.equal(initial.curriculum.enabled,false);
 bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4'});bot.on('error',console.error);await once(bot,'spawn');await sleep(2000);
 await post('/observer/start',{player:name,target:'LabAI0',view:'first_person'});await sleep(2000);
 const state=await status(),p=state.agents.LabAI0.position,roof=bot.blockAt(new Vec3(Math.floor(p[0]),224,Math.floor(p[2])));assert.equal(roof?.name,'sea_lantern');
 const health=[];for(let i=0;i<7;i++){const s=await status();health.push(Object.fromEntries(Object.entries(s.agents).map(([n,a])=>[n,a.health])));await sleep(5000);}
 assert.ok(health.every(sample=>Object.entries(sample).every(([n,h])=>h===health[0][n])),'Health stays unchanged while paused');
 const result={roof_block:roof.name,roof_y:224,paused_seconds:35,health_samples:health,phantoms_visible:Object.values(bot.entities).filter(e=>e.name==='phantom').length,console_broadcasts_disabled:fs.readFileSync('server/server.properties','utf8').includes('broadcast-console-to-ops=false')};
 assert.equal(result.phantoms_visible,0);assert.ok(result.console_broadcasts_disabled);fs.writeFileSync('docs/practice-protection-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await post('/observer/stop',{player:name}).catch(()=>{});if(bot)bot.quit();}
})().catch(e=>{console.error(e);process.exitCode=1;});

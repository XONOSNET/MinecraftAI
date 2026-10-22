const fs=require('fs'),mineflayer=require('mineflayer'),assert=require('assert/strict');
const {once}=require('events'),name='LabHUDProbe',token=fs.readFileSync('data/api-token','utf8').trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});assert.ok(r.ok);return r.json()}
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4'}),packets=[];
bot._client.on('boss_bar',p=>packets.push(p));bot.on('error',console.error);
(async()=>{try{await once(bot,'spawn');await delay(2500);await post('/observer/start',{player:name,target:'LabAI0',view:'side'});await delay(4000);
assert.ok(packets.filter(p=>p.action===0).length>=2,'two personal bossbars received');assert.ok(packets.some(p=>p.action===3),'live title updates received');
await post('/observer/stop',{player:name});await delay(500);assert.ok(packets.filter(p=>p.action===1).length>=2,'HUD removed on stop');
fs.writeFileSync('docs/observer-hud-check.json',JSON.stringify({bossbars_added:packets.filter(p=>p.action===0).length,updates:packets.filter(p=>p.action===3).length,removed:packets.filter(p=>p.action===1).length,passed:true},null,2));console.log('Native HUD add/update/remove checks passed');
}finally{await post('/observer/stop',{player:name}).catch(()=>{});bot.quit()}})().catch(e=>{console.error(e);process.exitCode=1});

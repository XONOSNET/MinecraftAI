const fs=require('fs'),mineflayer=require('mineflayer'),assert=require('assert/strict');
const {once}=require('events'),name='LabHUDProbe',token=fs.readFileSync('data/api-token','utf8').trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});assert.ok(r.ok);return r.json()}
const scores=new Set();const rowLabels=[];const rosterPackets=[];let cameraMoves=0,cameraId;
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline',version:'1.21.4'}),packets=[];
bot._client.on('camera',p=>cameraId=p.cameraId);
bot._client.on('packet',(p,m)=>{if(m.name==='scoreboard_score'){scores.add(p.itemName);rowLabels.push(JSON.stringify(p));}if(m.name.includes('scoreboard'))rosterPackets.push(m.name);if(cameraId!==undefined&&p?.entityId===cameraId&&/move|position|teleport/.test(m.name))cameraMoves++});
bot._client.on('boss_bar',p=>packets.push(p));bot.on('error',console.error);
(async()=>{try{await once(bot,'spawn');await delay(2500);await post('/observer/start',{player:name,target:'LabAI0',view:'orbit'});await delay(6000);
assert.equal([...scores].filter(n=>/^LabAI[0-9]+$/.test(n)).length,8,'all eight bot rows received');
assert.ok(rowLabels.every(p=>!p.includes('A0001')&&!p.includes(' D0')),'compact rows omit serials and death counters');
assert.ok(rosterPackets.some(n=>n.includes('objective')),'native right sidebar received');
assert.ok(cameraMoves>=20,'camera moves at higher cadence: '+cameraMoves);
assert.ok(packets.filter(p=>p.action===0).length>=3,'stage, trial and phase bars received');assert.ok(packets.some(p=>JSON.stringify(p).includes('Stage ')&&JSON.stringify(p).includes(' of 60')),'curriculum stage header received');assert.ok(packets.some(p=>p.action===3),'live title updates received');
await post('/observer/stop',{player:name});await delay(500);assert.ok(packets.filter(p=>p.action===1).length>=2,'HUD removed on stop');
fs.writeFileSync('docs/observer-hud-check.json',JSON.stringify({bossbars_added:packets.filter(p=>p.action===0).length,updates:packets.filter(p=>p.action===3).length,removed:packets.filter(p=>p.action===1).length,bot_rows:[...scores],compact_labels:true,roster_packets:[...new Set(rosterPackets)],camera_teleports:cameraMoves,passed:true},null,2));console.log('Native HUD add/update/remove checks passed');
}finally{await post('/observer/stop',{player:name}).catch(()=>{});bot.quit()}})().catch(e=>{console.error(e);process.exitCode=1});



const fs=require('fs'),mineflayer=require('mineflayer');
const token=fs.readFileSync('data/api-token','utf8').trim(),name='LabVisionTest';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json()}
(async()=>{
 const b=mineflayer.createBot({host:'127.0.0.1',username:name,version:'1.21.4',auth:'offline',chatLengthLimit:10000});
 const messages=[];b.on('messagestr',s=>messages.push(s));
 try{
  await new Promise((resolve,reject)=>{b.once('spawn',resolve);b.once('error',reject)});
  await post('/admin/action',{action:'op',player:name});await wait(400);
  b.chat('/gamemode spectator');b.chat('/tp @s 702 181 151');await wait(800);
  const commands=JSON.parse(require('child_process').execFileSync('.venv/Scripts/python.exe',['-c',`
from pathlib import Path
import json, math, tempfile
from lab.vision import VisionLines
commands=[];now=[100]
with tempfile.TemporaryDirectory() as folder:
    lines=VisionLines(Path(folder)/'vision.json',commands.append,clock=lambda:now[0])
    lines.configure({'enabled':True})
    agents={'LabAI0':{'connected':True,'last_seen':100,'position':[702,181,151], 'vision':dict(yaw=0,hfov=math.pi/2,vfov=1,range=16,eye_height=1.62)}}
    lines.tick(agents,{},True)
    now[0]+=.25;agents['LabAI0']['vision']['yaw']=.5
    lines.tick(agents,{},True)
print(json.dumps([c.replace('lab_vision_', 'lab_probe_') for c in commands]))
`],{encoding:'utf8'}));
  for(const c of commands){b.chat('/'+c);await wait(120)}
  await wait(300);
  const count=messages.some(s=>/Teleported 5 entities/.test(s))?5:0;
  const last=commands.filter(c=>c.startsWith('data merge')).at(-1);
  const selector=last.match(/entity (\S+)/)[1];
  b.chat('/data get entity '+selector+' transformation.scale');await wait(500);
  const scaleMessage=messages.find(s=>s.includes('16.0f')&&s.includes('0.035'));
  const errors=messages.filter(s=>/Expected|Invalid|Unknown|Incorrect|Unable to/i.test(s));
  if(count!==5||!scaleMessage||errors.length)throw Error(JSON.stringify({count,scaleMessage,errors,messages}));
  const result={display_entities:count,center_scale:scaleMessage,update_commands:commands.filter(c=>c.startsWith('data merge')).length,errors};
  fs.writeFileSync('docs/vision-beams-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
  b.chat('/kill @e[type=minecraft:block_display,tag=lab_probe_beam]');await wait(300);
  await post('/admin/action',{action:'deop',player:name});b.quit();
 }
})().catch(e=>{console.error(e);process.exitCode=1});

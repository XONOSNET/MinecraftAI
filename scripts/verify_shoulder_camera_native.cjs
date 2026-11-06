// Isolated spectator-camera geometry check; never changes a training bot.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process'),m=require('mineflayer'),{once}=require('events');
const name='LabShoulderTest',tag='lab_shoulder_fixture',wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const commands=JSON.parse(execFileSync('.venv/Scripts/python.exe',['-c',`import json; from lab.observers import camera_spawn,camera_move,shoulder_pitch,shoulder_distance; print(json.dumps(dict(spawn=camera_spawn('${name}','${name}','${tag}','shoulder',3,2,0),cases=[dict(yaw=y,pitch=p,effective=shoulder_pitch(p*.5,3,2),boom=shoulder_distance(p*.5,3,2),command=camera_move('${name}','${tag}','shoulder',3,2,0,pose=(y,shoulder_pitch(p*.5,3,2)))) for y in [0,90,180,270] for p in [-60,0,60]])))`],{encoding:'utf8'}));
const b=m.createBot({host:'127.0.0.1',port:25565,username:name,version:'1.21.4',auth:'offline'}),report={diagnostic_only:true,cases:[]};b.on('error',console.error);
async function admin(data){for(let i=0;i<20;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:name,...data})});if(r.ok)return r.json();await wait(300);}throw Error('Diagnostic player unavailable');}
async function command(c){b.chat('/'+c);await wait(180);}
(async()=>{let original,mode;try{
 await once(b,'spawn');await wait(1800);original=b.entity.position.clone();mode=b.game.gameMode;
 await admin({action:'gamemode',gamemode:'spectator'});b.physicsEnabled=false;await admin({action:'teleport-coordinates',x:-1625.5,y:225,z:-1625.5});await wait(1200);await admin({action:'op'});await wait(500);
 await command(`kill @e[tag=${tag}]`);await command(commands.spawn);
 for(const {yaw,pitch,effective,boom,command:move} of commands.cases){
  await command(`tp @s -1625.5 225 -1625.5 ${yaw} ${pitch}`);await command(move);await wait(180);
  const c=Object.values(b.entities).find(e=>e.name==='item_display');assert.ok(c,'fixture camera visible');
  const y=yaw*Math.PI/180,p=effective*Math.PI/180,expected=[-1625.5+boom*Math.sin(y)*Math.cos(p)-.9*Math.cos(y),226.6+boom*Math.sin(p),-1625.5-boom*Math.cos(y)*Math.cos(p)-.9*Math.sin(y)];
  assert.ok(c.position.distanceTo({x:expected[0],y:expected[1],z:expected[2]})<.08,'mount orbits behind right shoulder with live pitch '+JSON.stringify({actual:c.position.toArray(),expected,subject:b.entity.position.toArray(),commands}));
  assert.ok(Math.abs(c.pitch+p)<.03,'camera pitch follows attenuated angle with low-orbit limit');
  const dx=-1625.5-c.position.x,dy=226.6-c.position.y,dz=-1625.5-c.position.z;
  const cameraUp=[Math.sin(c.yaw)*Math.sin(c.pitch),Math.cos(c.pitch),Math.cos(c.yaw)*Math.sin(c.pitch)];
  assert.ok(Math.abs(dx*cameraUp[0]+dy*cameraUp[1]+dz*cameraUp[2])<.08,'shoulder pivot stays vertically centered');
  const toward=[-1625.5-c.position.x,-1625.5-c.position.z],screenRight=[Math.cos(c.yaw),-Math.sin(c.yaw)];assert.ok(toward[0]*screenRight[0]+toward[1]*screenRight[1]<0,'character appears on the left');
  report.cases.push({yaw,pitch,camera:c.position.toArray(),cameraPitch:c.pitch});
 }
 report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;}finally{
 await command(`kill @e[tag=${tag}]`).catch(()=>{});await admin({action:'deop'}).catch(()=>{});
 if(original)await admin({action:'teleport-coordinates',x:original.x,y:original.y,z:original.z}).catch(()=>{});
 if(mode)await admin({action:'gamemode',gamemode:mode}).catch(()=>{});report.cleaned=true;b.quit();fs.writeFileSync('logs/shoulder-camera-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));setTimeout(()=>process.exit(process.exitCode||0),300);
}})().catch(e=>{console.error(e);b.quit();process.exit(1)});

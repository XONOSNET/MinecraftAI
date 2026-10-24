const fs=require('fs'),mineflayer=require('mineflayer');
const {scan}=require('../controller/perception'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),name='LabSprintTest',wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(body){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text())}
(async()=>{const status=await(await fetch('http://127.0.0.1:8000/status')).json();if(status.curriculum.enabled)throw Error('Pause automation before the sprint fixture');
const b=mineflayer.createBot({host:'127.0.0.1',username:name,version:'1.21.4',auth:'offline'}),permissions={move:true,turn:true,jump:true,sprint:true};let motor;const messages=[];b.on('messagestr',s=>messages.push(s));
async function cmd(s){b.chat('/'+s);await wait(350)}
try{await new Promise((resolve,reject)=>{b.once('spawn',resolve);b.once('error',reject)});await post({action:'op',player:name});await wait(400);await cmd('gamemode creative');await cmd('forceload add 700 140 704 180');await wait(1000);
await cmd('fill 700 180 140 704 180 180 stone');await cmd('fill 700 181 140 704 184 180 air');await cmd('tp @s 702.5 181 174.5 180 0');await wait(1200);await cmd('gamemode survival');await cmd('effect give @s instant_health 1 5 true');await cmd('effect give @s saturation 30 5 true');
motor=createMotor(b,permissions);b.on('physicsTick',()=>motor.tick());
async function run(sprint){motor.pause();permissions.sprint=sprint;await cmd('tp @s 702.5 181 174.5 180 0');await wait(1500);await b.look(0,0,true);if(Math.abs(b.entity.position.x-702.5)>.1||Math.abs(b.entity.position.z-174.5)>.1||!b.entity.onGround)throw Error('Fixture did not settle '+JSON.stringify({position:b.entity.position,messages}));const start=b.entity.position.clone();let samples=0;
for(let i=0;i<15;i++){motor.command(0,null,{...scan(b).proximity,cueDistance:32},0);await wait(100);samples+=!!b.getControlState('sprint');}
const distance=start.distanceTo(b.entity.position);motor.pause();return {distance,samples,start,end:b.entity.position.clone()};}
const walk=await run(false),sprint=await run(true);if(!sprint.samples||sprint.distance<walk.distance*1.15)throw Error(JSON.stringify({walk,sprint}));
await cmd('tp @s 702.5 181 174.5 180 0');await cmd('fill 700 181 169 704 183 169 stone');await wait(500);await b.look(0,0,true);let started=false,stoppedAt=null;
for(let i=0;i<30;i++){motor.command(0,null,{...scan(b).proximity,cueDistance:32},0);await wait(100);const running=!!b.getControlState('sprint');started ||= running;if(started&&!running){stoppedAt=b.entity.position.z-170;break;}}
motor.pause();if(!started||stoppedAt===null||stoppedAt<1.5)throw Error(JSON.stringify({started,stoppedAt}));
const result={walk_blocks:walk.distance,sprint_blocks:sprint.distance,speed_ratio:sprint.distance/walk.distance,sprint_samples:sprint.samples,wall_stop_sprinting_distance:stoppedAt};fs.writeFileSync('docs/sprint-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{motor?.pause();await cmd('gamemode spectator');await cmd('fill 700 180 140 704 184 180 air');await cmd('forceload remove 700 140 704 180');await post({action:'deop',player:name});b.quit();}
})().catch(e=>{console.error(e);process.exitCode=1});

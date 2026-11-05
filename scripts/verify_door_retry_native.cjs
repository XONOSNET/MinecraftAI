// Diagnostic build only; all navigation and leaf clearing are real survival actions.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldNavigation,homeApproach}=require('../controller/world_navigation'),{WorldTiming}=require('../controller/world_timing'),{route}=require('../controller/field_navigation'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-700,y:211,z:-700},result={fixture:'Real open-door panel snag, both hinges/directions, after deliberately expired alignment. No learning writes.'};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabDoorRetry',version:'1.21.4'});inventory.attach(b);let changed=false,finished=false,motor;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(100);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;motor?.pause();try{await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['kill @e[type=item,x=-707,y=209,z=-710,dx=14,dy=8,dz=17]','fill -707 209 -710 -693 217 -693 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/door-retry-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-700,y:220,z:-700});await wait(1800);
 for(let x=-707;x<=-693;x++)for(let z=-710;z<=-693;z++)for(let y=209;y<=217;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume not empty');
 changed=true;await commands(['fill -707 209 -710 -693 210 -693 grass_block','fill -703 211 -703 -697 213 -697 oak_planks hollow','fill -703 214 -703 -697 214 -697 oak_planks','fill -702 211 -702 -698 213 -698 air','fill -700 211 -703 -700 212 -703 air','clear @s']);
 await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(300);
 const state={run:'door-matrix',world:{bounds:[-710,-690,-712,-690],count:1,driver:'teacher'}},api=async(path,d)=>{if(path==='/step')return {action:d.teacher};throw Error('Diagnostic must not mutate learning: '+path);};
 let clockOffset=0;motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true},{clock:()=>Date.now()+clockOffset});b.on('physicsTick',()=>motor.tick());const care=require('../controller/door_care').createDoorCare(b);result.runs=[];
 for(const profile of ['flat'])for(const hinge of ['left','right'])for(const direction of ['exit','enter']){
  motor.pause();care.reset();await commands(['fill -707 209 -710 -693 210 -704 grass_block',...(profile==='lower'?['fill -707 210 -710 -693 210 -704 air']:profile==='raised'?['fill -707 211 -710 -693 211 -705 grass_block']:[]),`setblock -700 211 -703 oak_door[facing=north,half=lower,hinge=${hinge},open=true]`,`setblock -700 212 -703 oak_door[facing=north,half=upper,hinge=${hinge},open=true]`]);
  const start=direction==='exit'?[-699.5113,211,-702.4371]:[-699.5113,211,-702.5629],goal=direction==='exit'?[-699.5,profile==='lower'?210.1:profile==='raised'?212.1:211.1,-705.5]:[-699.5,211.1,-699.5];
  await post({action:'teleport-coordinates',player:b.username,x:start[0],y:start[1],z:start[2]});await wait(400);await b.look(direction==='exit'?0:Math.PI,0,true);
  const t=new HutTeacher();Object.assign(t,{plot,campPlots:[plot],phase:direction==='exit'?'night_food':'return_home',runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),path:[],lastProgress:Date.now()});
  const blockedScan=(...args)=>{const sensed=scan(...args);sensed.proximity.canWalk=()=>false;return sensed;};
  await t.walk(b,motor,goal,state,api,blockedScan,tasks);clockOffset+=21000;
  await t.walk(b,motor,goal,state,api,blockedScan,tasks);clockOffset+=1100;
  const at=Date.now();let arrived=false;while(Date.now()-at<20000){if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){arrived=true;break;}await care.update();await wait(100);}
  motor.pause();result.runs.push({profile,hinge,direction,arrived,seconds:(Date.now()-at)/1000,position:b.entity.position.toArray(),navigation:t.lastNavigation});
 }
 result.success=result.runs.every(r=>r.arrived)&&b.health===20;result.health=b.health;

}catch(e){result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});setTimeout(()=>{result.error='Native test deadline';result.success=false;finish();},350000).unref();

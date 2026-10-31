// Isolated bed fixture; never changes global time or writes demonstrations/rewards.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),sleep=require('../controller/night_sleep');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-250,y:210,z:-250};
const result={fixture:'Temporary diagnostic bed platform; setup in creative, interaction in survival, natural server time unchanged.'};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabSleepCheck',version:'1.21.4'});let changed=false,finished=false;
async function post(data){for(let i=0;i<8;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(i===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(150);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;try{if(b.isSleeping)await b.wake();await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['fill -253 209 -253 -247 212 -247 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/night-sleep-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1800);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-250,y:214,z:-250});await wait(2000);
 for(let x=-253;x<=-247;x++)for(let y=209;y<=212;y++)for(let z=-253;z<=-247;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume is not empty');
 changed=true;await commands(['fill -253 209 -253 -247 209 -247 stone','give @s white_bed','tp @s -249.5 210 -249.5']);await wait(600);
 await b.equip(b.inventory.items().find(i=>i.name==='white_bed'),'hand');await b.look(Math.PI,0,true);
 await b._placeBlockWithOptions(b.blockAt(new Vec3(-248,209,-251)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});
 await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(800);
 if(b.game.gameMode!=='survival')throw Error('Diagnostic interaction must be survival');
 const t={plot,wilderness:{}},motor={pause(){b.clearControlStates();}};result.time=b.time.timeOfDay;result.game_mode=b.game.gameMode;
 result.message=await sleep.tick(t,b,motor,async()=>{throw Error('Unexpected movement');});result.sleep_confirmed=!!b.isSleeping;
 if(result.time>=12541&&result.time<=23458){if(!b.isSleeping)throw Error(result.message);await b.wake();await wait(400);result.wake_confirmed=!b.isSleeping;result.success=result.wake_confirmed;}
 else{if(b.isSleeping)throw Error('Daytime should not attempt sleep');let refused=false;try{await b.sleep(b.blockAt(new Vec3(-248,210,-251)));}catch(e){refused=true;result.daytime_rejection=e.message;}result.success=refused&&/waiting for night|waiting for dawn/.test(result.message);result.positive_sleep_check='Awaiting natural night; covered by state-machine tests.';}
}catch(e){result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});
setTimeout(()=>{result.error='Native verification deadline';result.success=false;finish();},60000).unref();

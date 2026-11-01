// Diagnostic build only; all navigation and leaf clearing are real survival actions.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldNavigation,homeApproach}=require('../controller/world_navigation'),{WorldTiming}=require('../controller/world_timing'),{route}=require('../controller/field_navigation'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-700,y:211,z:-700},result={fixture:'Real survival return from a one-block-higher porch, off-center threshold entry, and exit. No learning writes.'};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabHighDoor',version:'1.21.4'});inventory.attach(b);let changed=false,finished=false,motor;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(100);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;motor?.pause();try{await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['kill @e[type=item,x=-707,y=209,z=-710,dx=14,dy=8,dz=17]','fill -707 209 -710 -693 217 -693 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/high-door-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-700,y:220,z:-700});await wait(1800);
 for(let x=-707;x<=-693;x++)for(let z=-710;z<=-693;z++)for(let y=209;y<=217;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume not empty');
 changed=true;await commands(['fill -707 209 -710 -693 209 -693 grass_block','fill -703 210 -703 -697 210 -697 grass_block','fill -703 211 -703 -697 213 -697 oak_planks hollow','fill -703 214 -703 -697 214 -697 oak_planks','fill -702 211 -702 -698 213 -698 air','fill -700 211 -703 -700 212 -703 air','clear @s','give @s oak_door','tp @s -699.5 211 -699.5']);await wait(300);
 await inventory.equip(b,'oak_door');await b.look(0,0,true);await b._placeBlockWithOptions(b.blockAt(new Vec3(-700,210,-703)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});await b.activateBlock(b.blockAt(new Vec3(-700,211,-703)));await wait(300);await commands(['fill -701 211 -707 -699 211 -705 stone','fill -701 210 -704 -699 210 -704 stone']);await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(500);
 const t=new HutTeacher(),state={run:'entrance-native',world:{bounds:[-710,-690,-712,-690],count:1,driver:'teacher'}},api=async(path,d)=>{if(path==='/step')return {action:d.teacher};throw Error('No learning/API mutation allowed: '+path);};Object.assign(t,{plot,campPlots:[plot],phase:'leave_hut',runtime:tasks.createRuntime(),timing:new WorldTiming(Date.now()),path:[],lastProgress:Date.now()});
 const door=b.blockAt(new Vec3(-700,211,-703)),descriptor=require('../controller/doorway').doorwayDescriptor(b,door,[-699.5,211.1,-705.5]);
 if(!descriptor)throw Error('No fixture door descriptor');
 await post({action:'teleport-coordinates',player:b.username,x:descriptor.center,y:212,z:-705.5});await wait(500);
 await b.look(Math.PI,0,true);t.phase='stone_return';t.navigator=new WorldNavigation();
 motor=createMotor(b,{move:true,turn:true,jump:true,sprint:true});b.on('physicsTick',()=>motor.tick());
 result.start=b.entity.position.clone();result.start_mode=b.game.gameMode;
 const start=Date.now(),goal=[plot.x+.5,plot.y+.1,plot.z+.5];let arrived=false;
 while(Date.now()-start<20000){if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){arrived=true;break;}await wait(100);}
 motor.pause();result.seconds=Math.round((Date.now()-start)/100)/10;result.position=b.entity.position.clone();result.health=b.health;result.mode=b.game.gameMode;result.navigation=t.lastNavigation;result.success=arrived&&b.health===20&&b.game.gameMode==='survival';
 if(!result.success)throw Error('High approach failed');
 await post({action:'teleport-coordinates',player:b.username,x:descriptor.center+.102,y:211,z:-702.87});await wait(500);t.navigator=new WorldNavigation();motor.pause();const driftAt=Date.now();let driftArrived=false;
 while(Date.now()-driftAt<20000){if(await t.walk(b,motor,goal,state,api,scan,tasks)===true){driftArrived=true;break;}await wait(100);}
 motor.pause();result.drift={arrived:driftArrived,seconds:Math.round((Date.now()-driftAt)/100)/10};if(!driftArrived)throw Error('Threshold drift failed');
 t.phase='light_exit';t.navigator=new WorldNavigation();const exterior=homeApproach(plot,b),exitStart=Date.now();let exited=false;
 while(Date.now()-exitStart<20000){if(await t.walk(b,motor,exterior,state,api,scan,tasks)===true){exited=true;break;}await wait(100);}
 motor.pause();result.exit={seconds:Math.round((Date.now()-exitStart)/100)/10,position:b.entity.position.clone(),health:b.health,navigation:t.lastNavigation};
 result.success=exited&&b.health===20&&b.game.gameMode==='survival';

}catch(e){result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});setTimeout(()=>{result.error='Native test deadline';result.success=false;finish();},160000).unref();

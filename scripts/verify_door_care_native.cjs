const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const {createMotor}=require('../controller/locomotion'),{doorwayDescriptor}=require('../controller/doorway'),{scan}=require('../controller/perception');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabDoorCheck',version:'1.21.4'});
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(!r.ok)throw Error(await r.text());};
const {createDoorCare}=require('../controller/door_care');const care=createDoorCare(b);
const motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});b.on('physicsTick',()=>motor.tick());
b.once('spawn',async()=>{const result={runs:[]};
 try{
  await wait(2000);await post({action:'op'});await wait(800);b.chat('/gamemode survival @s');await post({action:'teleport-coordinates',x:-7.5,y:181,z:10});await wait(600);
  b.chat('/fill -10 181 12 -6 183 12 minecraft:stone');await wait(250);
  for(const hinge of ['left','right']){
   b.chat(`/setblock -8 181 12 minecraft:oak_door[facing=north,half=lower,hinge=${hinge},open=true]`);await wait(150);b.chat(`/setblock -8 182 12 minecraft:oak_door[facing=north,half=upper,hinge=${hinge},open=true]`);await wait(500);
   for(const direction of [1,-1]){
    care.reset();b.chat(`/setblock -8 181 12 minecraft:oak_door[facing=north,half=lower,hinge=${hinge},open=true]`);await wait(200);b.chat(`/setblock -8 182 12 minecraft:oak_door[facing=north,half=upper,hinge=${hinge},open=true]`);await wait(300);
    motor.pause();await post({action:'teleport-coordinates',x:-7.5,y:181,z:direction===1?10:15});await wait(500);
    const goal=[-7.5,181,direction===1?15:10],started=Date.now();let crossed=0,lastSide=direction===1?-1:1,done=false;
    while(Date.now()-started<14000){
     await care.update();const p=b.entity.position,door=b.blockAt(new Vec3(-8,181,12)),descriptor=doorwayDescriptor(b,door,goal),desired=Math.atan2(-(goal[0]-p.x),-(goal[2]-p.z)),angle=Math.atan2(Math.sin(desired-b.entity.yaw),Math.cos(desired-b.entity.yaw));
     const sensed=scan(b,{rays:64,goalYaw:desired});motor.command(0,{kind:'expedition',quick_look:true,safe_walk:true},{...sensed.proximity,doorway:descriptor,cueDistance:Math.hypot(goal[0]-p.x,goal[2]-p.z)},angle);
     const side=p.z<12.45?-1:p.z>12.55?1:lastSide;if(side!==lastSide){crossed++;lastSide=side;}
     if(direction===1?p.z>=14:p.z<=11){done=true;break;}await wait(100);
    }
    motor.pause();result.runs.push({hinge,direction,complete:done,closed:!b.blockAt(new Vec3(-8,181,12)).getProperties().open,planeCrossings:crossed,seconds:(Date.now()-started)/1000,position:b.entity.position.clone()});
   }
  }
  result.success=result.runs.every(r=>r.complete&&r.closed&&r.planeCrossings===1);
 }catch(error){result.error=error.message;}
 finally{motor.pause();b.chat('/fill -10 181 12 -6 183 12 minecraft:air');await wait(300);await post({action:'deop'}).catch(()=>{});fs.writeFileSync('docs/door-care-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});setTimeout(async()=>{motor.pause();await post({action:'deop'}).catch(()=>{});b.quit();process.exit(1);},80000).unref();

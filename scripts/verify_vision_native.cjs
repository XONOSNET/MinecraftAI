const fs=require('fs'),mineflayer=require('mineflayer');const {Vec3}=require('vec3');const {scan}=require('../controller/perception'),{createMotor}=require('../controller/locomotion');
const token=fs.readFileSync('data/api-token','utf8').trim(),name='LabMotorTest';const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,data){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();}
(async()=>{const status=await(await fetch('http://127.0.0.1:8000/status')).json();if(status.curriculum.enabled)throw Error('Pause autonomy before running this fixture');const b=mineflayer.createBot({host:'127.0.0.1',username:name,version:'1.21.4',auth:'offline'});let motor;
 try{await new Promise((resolve,reject)=>{b.once('spawn',resolve);b.once('error',reject)});await wait(1000);await post('/admin/action',{action:'op',player:name});await wait(500);
 async function cmd(c){b.chat('/'+c);await wait(350)}
 await cmd('gamemode creative');await cmd('tp @s 702.5 181 151.5');await wait(2000);
 await cmd('fill 700 181 140 704 184 158 air');await cmd('fill 700 180 140 704 180 158 stone');await cmd('fill 700 181 150 704 183 150 stone');await cmd('tp @s 702.5 181 151.5 180 0');await wait(1000);await cmd('gamemode survival');await b.look(0,0,true);
 motor=createMotor(b,{move:true,turn:true,jump:true});b.on('physicsTick',()=>motor.tick());
 let start=b.entity.position.z,labels=new Set(),fov=0,reversed=0,detoured=false,walkOrigin=null;
 for(let i=0;i<70;i++){const s=scan(b);fov=Math.max(fov,s.vision.hfov);const label=motor.command(0,null,s.proximity,0);labels.add(label);if(label==='Recovering: moving around obstacle'&&!walkOrigin)walkOrigin={x:b.entity.position.x,z:b.entity.position.z};await wait(100);reversed=Math.max(reversed,b.entity.position.z-start);if(label==='Recovering: detour complete'){detoured=true;break;}}
 const detour=walkOrigin?Math.hypot(b.entity.position.x-walkOrigin.x,b.entity.position.z-walkOrigin.z):0;motor.pause();if(!detoured||detour<1.2)throw Error('No committed detour: '+JSON.stringify({detoured,detour,activities:[...labels]}));if(!(reversed>.15))throw Error('No physical reversing: '+reversed);if(!(fov>2.5))throw Error('Cone did not widen');
 await cmd('fill 700 181 140 704 184 158 air');await cmd('fill 700 181 150 704 183 150 stone');await cmd('fill 702 181 150 702 182 150 air');
 await cmd('setblock 702 181 150 oak_door[facing=north,half=lower,hinge=left,open=true]');await cmd('setblock 702 182 150 oak_door[facing=north,half=upper,hinge=left,open=true]');
 const panel=b.blockAt(new Vec3(702,181,150)).shapes[0],center=702+(panel[0]<.5?(panel[3]+1)/2:panel[0]/2);
 await cmd('tp @s '+center+' 181 153 180 0');await wait(800);await b.look(0,0,true);
 const doorway={id:'native-door',axis:'z',plane:150.5,center,open:true,y:181};let standingSamples=0,crouchedDoorSamples=0;
 for(let i=0;i<100;i++){const s=scan(b);motor.command(0,{kind:'advanced'},{...s.proximity,doorway},0);await wait(100);if(b.getControlState('forward')){if(b.getControlState('sneak'))crouchedDoorSamples++;else standingSamples++;}if(b.entity.position.z<149.45)break;}
 const uprightDoorTravel=153-b.entity.position.z;motor.pause();if(uprightDoorTravel<3.5||!standingSamples||crouchedDoorSamples)throw Error('Upright doorway crossing failed: '+JSON.stringify({uprightDoorTravel,standingSamples,crouchedDoorSamples}));
 await cmd('fill 700 181 140 704 184 158 air');
 await cmd('fill 700 181 146 704 183 150 air');await cmd('fill 700 182 146 704 182 150 minecraft:stone_slab[type=top]');await cmd('tp @s 702.5 181 151 180 0');await wait(800);await b.look(0,0,true);
 start=b.entity.position.z;let crouched=false;
 for(let i=0;i<40;i++){const s=scan(b);const label=motor.command(0,null,s.proximity,0);labels.add(label);await wait(100);crouched ||= !!b.getControlState('sneak');}
 motor.pause();const traversed=start-b.entity.position.z;if(!(crouched&&traversed>1.5))throw Error('Crouch passage failed: '+JSON.stringify({crouched,traversed}));
 const result={upright_doorway_metres:uprightDoorTravel,standing_door_samples:standingSamples,crouched_door_samples:crouchedDoorSamples,detour_metres:detour,reversed_metres:reversed,crouch_travel_metres:traversed,max_cone_degrees:fov*180/Math.PI,activities:[...labels]};fs.writeFileSync('docs/upright-recovery-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{motor?.pause();b.chat('/fill 700 180 140 704 184 158 air');await wait(400);try{await post('/admin/action',{action:'deop',player:name})}catch{}b.quit();}
})().catch(e=>{console.error(e);process.exitCode=1});

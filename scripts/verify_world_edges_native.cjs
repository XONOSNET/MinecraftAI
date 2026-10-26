const mineflayer=require('mineflayer'),fs=require('fs'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabEdgeCheck',version:'1.21.4'}),motor=createMotor(b,{move:true,turn:true,jump:true,sprint:false});b.on('physicsTick',()=>motor.tick());
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(!r.ok)throw Error(await r.text());};
b.once('spawn',async()=>{const result={scope:'Isolated native world-movement safety fixture; no production trial reports.'};
 try{
  await wait(2000);await post({action:'op'});await wait(1000);b.chat('/gamemode survival @s');await wait(200);
  b.chat('/fill -14 185 12 -6 186 16 air');await wait(200);b.chat('/fill -14 185 12 -9 185 16 stone');await wait(300);
  await post({action:'deop'});await post({action:'teleport-coordinates',x:-10.5,y:186,z:14.5});await wait(600);await b.look(-Math.PI/2,0,true);
  let label;const task={kind:'expedition',safe_walk:true,waypoints:[[-7.5,186.1,14.5]]};
  for(let i=0;i<40;i++){if(i%8===0)label=motor.command(0,task,scan(b).proximity,0);await wait(100);}
  motor.pause();result.edge={position:b.entity.position.clone(),label};result.edge.held=result.edge.position.x<-8&&result.edge.position.y>185.9&&String(label).includes('unsafe drop');
  await post({action:'teleport-coordinates',x:-10.5,y:186,z:14.5});await wait(600);await b.look(-Math.PI/2,0,true);
  for(let i=0;i<40;i++){motor.command(0,{kind:'expedition'},scan(b).proximity,0);await wait(100);}
  motor.pause();result.control={position:b.entity.position.clone()};result.control.fell=result.control.position.x>-8&&result.control.position.y<185;
  await post({action:'op'});await wait(1000);b.chat('/fill -8 186 12 -6 186 16 stone');await wait(300);await post({action:'deop'});
  await post({action:'teleport-coordinates',x:-9.5,y:186,z:14.5});await wait(600);await b.look(-Math.PI/2,0,true);
  const started=Date.now();while(Date.now()-started<8000&&(b.entity.position.x<-7.8||b.entity.position.y<186.9)){
   motor.command(3,{kind:'expedition',safe_walk:true,waypoints:[[-7.5,187.1,14.5]]},scan(b).proximity,0);await wait(100);
  }
  motor.pause();result.step={position:b.entity.position.clone()};result.step.climbed=result.step.position.x>-8&&result.step.position.y>186.9;result.success=result.edge.held&&result.control.fell&&result.step.climbed;
 }catch(error){result.error=error.stack;}
 finally{motor.pause();await post({action:'teleport-coordinates',x:-12.5,y:181,z:10.5}).catch(()=>{});await post({action:'op'}).catch(()=>{});await wait(1000);b.chat('/fill -14 185 12 -6 186 16 air');await wait(300);await post({action:'deop'}).catch(()=>{});fs.writeFileSync('docs/world-edges-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});setTimeout(async()=>{await post({action:'deop'}).catch(()=>{});b.quit();process.exit(1)},60000).unref();

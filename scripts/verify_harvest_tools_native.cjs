// Isolated survival fixture; granted axe and logs are never production rewards.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{harvest}=require('../controller/harvest');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabHarvestCheck',version:'1.21.4'});inventory.attach(b);
b.once('spawn',async()=>{
 const result={fixture:'Hand versus wooden axe on server-confirmed oak logs, including smooth elevated aiming.'};
 const write=b._client.write.bind(b._client);b._client.write=(packet,data)=>{if(packet==='block_dig'&&data.status===0){(result.dig_starts||=[]).push({tool:b.heldItem?.name||'hand',on_ground:b.entity.onGround,native_ms:b.digTime(b.blockAt(data.location))});}return write(packet,data);};
 try{
  await wait(2000);await post({action:'op',player:b.username});await wait(1000);
  for(const command of ['/clear @s','/gamemode survival @s','/give @s wooden_axe','/setblock -18 181 17 oak_log','/setblock -18 184 17 oak_log']){b.chat(command);await wait(200);}
  await post({action:'deop',player:b.username});await post({action:'teleport-coordinates',player:b.username,x:-16.5,y:181,z:17.5});await wait(1200);
  b.setQuickBarSlot(8);await wait(100);await inventory.sync(b);
  if(b.heldItem)throw Error('Hand comparison needs an empty selected slot');
  await b.look(Math.PI/2,0,true);let at=Date.now();result.hand_removed=await harvest(b,b.blockAt(new Vec3(-18,181,17)));result.hand_ms=Date.now()-at;
  await inventory.equip(b,'wooden_axe');const pitches=[],sample=()=>pitches.push(b.entity.pitch);b.on('physicsTick',sample);
  at=Date.now();result.axe_removed=await harvest(b,b.blockAt(new Vec3(-18,184,17)));result.axe_ms=Date.now()-at;b.removeListener('physicsTick',sample);
  result.aim_pitch_samples=new Set(pitches.map(p=>p.toFixed(2))).size;
  result.success=result.hand_removed&&result.axe_removed&&result.axe_ms<result.hand_ms&&result.aim_pitch_samples>3;
 }catch(error){result.error=error.stack;}
 finally{
  await post({action:'op',player:b.username}).catch(()=>{});await wait(1000);
  b.chat('/setblock -18 181 17 air');await wait(200);b.chat('/setblock -18 184 17 air');await wait(200);
  await post({action:'deop',player:b.username}).catch(()=>{});fs.writeFileSync('docs/harvest-tools-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);
 }
});
setTimeout(async()=>{await post({action:'deop',player:b.username}).catch(()=>{});b.quit();process.exit(1);},45000).unref();

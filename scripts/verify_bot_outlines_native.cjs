// Verify the native bot-only outline and recovery after a reset clears effects.
const fs=require('fs'),mineflayer=require('mineflayer');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabGlowCheck',version:'1.21.4'});
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok){const message=await r.text();if(message.includes('not online')&&(data._retries||0)<8){await wait(500);return post({...data,_retries:(data._retries||0)+1});}throw Error(message);}};
b.once('spawn',async()=>{const result={fixture:'Native glowing metadata and automatic recovery after effect clearing; no model, movement or inventory changes to lab bots.'};let op=false;const messages=[];b.on('message',m=>messages.push(m.toString()));
 try{
  await wait(2500);await post({action:'gamemode',player:b.username,gamemode:'spectator'});
  const status=await (await fetch('http://127.0.0.1:8000/status')).json(),p=status.agents.LabAI0.position;
  await post({action:'teleport-coordinates',player:b.username,x:p[0]+3,y:p[1]+5,z:p[2]+3});await wait(1500);
  await post({action:'op',player:b.username});op=true;await wait(1000);b.chat('/minecraft:reload');await wait(2000);
  const flags=()=>b.players.LabAI0?.entity?.metadata?.[0]||0;result.initial_outline=!!(flags()&64);
  b.chat('/effect clear LabAI0 minecraft:glowing');await wait(300);result.restored_after_clear=!!(flags()&64);
  b.chat('/execute if data entity LabAI0 active_effects[{id:"minecraft:glowing"}] run data get entity LabAI0 active_effects');await wait(500);
  result.effect_condition_verified=messages.some(m=>m.includes('glowing')&&m.includes('id:'));result.non_bot_unchanged=!(b.entity.metadata?.[0]&64);
  result.success=result.initial_outline&&result.restored_after_clear&&result.effect_condition_verified&&result.non_bot_unchanged;
 }catch(e){result.error=e.stack;}finally{if(op)await post({action:'deop',player:b.username}).catch(()=>{});fs.writeFileSync('docs/bot-outlines-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),200);}
});setTimeout(()=>{b.quit();process.exit(1);},35000).unref();

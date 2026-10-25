const mineflayer=require('mineflayer'),fs=require('fs');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabCamKeys',version:'1.21.4'});
const post=async(action,data)=>{const r=await fetch('http://127.0.0.1:8000/observer/'+action,{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(!r.ok)throw Error(await r.text());return r.json();};
const session=async()=>{const s=await(await fetch('http://127.0.0.1:8000/status')).json();return s.observer.sessions.find(s=>s.player===b.username);};
b.once('spawn',async()=>{const result={};const write=b._client.write.bind(b._client);b._client.write=(name,data)=>{if(name!=='player_input')write(name,data);};
 const press=async key=>{for(let i=0;i<12;i++){write('player_input',{inputs:{[key]:true}});await wait(50);}write('player_input',{inputs:{}});await wait(700);return session();};
 try{
  await wait(2500);await post('start',{target:'LabAI0',view:'orbit',distance:2,height:4,cycle_enabled:false});await wait(1500);
  result.initial=await session();result.sprint=await press('sprint');result.forward=await press('forward');result.backward=await press('backward');result.minimum=await press('backward');result.clamped=await press('backward');result.left=await press('left');result.right=await press('right');
  b.chat('/trigger lab_camera set 1');await wait(1000);result.chat=await session();
  result.success=result.sprint.view==='action'&&result.forward.distance===3&&result.backward.distance===2&&result.minimum.distance===1&&result.clamped.distance===1&&result.left.height===3&&result.right.height===4&&result.chat.view==='first_person'&&result.chat.target==='LabAI0';
 }catch(error){result.error=error.message;}
 finally{await post('stop',{}).catch(()=>{});fs.writeFileSync('docs/camera-keys-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify({success:result.success,error:result.error,views:[result.initial?.view,result.sprint?.view,result.chat?.view],distances:[result.forward?.distance,result.backward?.distance,result.minimum?.distance,result.clamped?.distance],heights:[result.left?.height,result.right?.height]}));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});setTimeout(()=>{b.quit();process.exit(1);},40000).unref();

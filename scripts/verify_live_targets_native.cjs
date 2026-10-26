// Read-only spectator fixture observes real blocks and server display entities.
const mineflayer=require('mineflayer'),fs=require('fs'),{Vec3}=require('vec3');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const status=async()=>{const r=await fetch('http://127.0.0.1:8000/status');if(!r.ok)throw Error('Status unavailable');return r.json();};
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabTargetCheck',version:'1.21.4'});
b.once('spawn',async()=>{
 const result={fixture:'Spectator observes live world target blocks and marker entity locations; no resources or rewards granted.',matched:0,compared:0,highlight_pairs:0,removed_blocks:0,stale_marker_pairs:0};
 try{
  await wait(1800);for(let i=0;i<30;i++){const live=await status();if((live.players||[]).some(p=>p.name===b.username))break;await wait(250);}
  await post({action:'gamemode',gamemode:'spectator',player:b.username});await wait(1000);
  let s;for(let i=0;i<40;i++){s=await status();if(s.world_training.session?.phase==='running')break;await wait(1000);}
  await post({action:'teleport',player:b.username,destination:'LabAI0'});await wait(2500);
  for(let i=0;i<35;i++){
   s=await status();
   for(const a of Object.values(s.agents)){
    const t=a.harvest_intent;if(!t||t.run!==s.world_training.session?.run)continue;
    const p=new Vec3(...t.position),block=b.blockAt(p);if(!block)continue;
    result.compared++;
    if(block.name===t.block){result.matched++;if(Object.values(b.entities).filter(e=>e.name==='block_display'&&e.position.distanceTo(p)<.1).length>=2)result.highlight_pairs++;}
    else if(block.name==='air'){
     result.removed_blocks++;await wait(300);
     if(b.blockAt(p)?.name==='air'&&Object.values(b.entities).filter(e=>e.name==='block_display'&&e.position.distanceTo(p)<.1).length>=2)result.stale_marker_pairs++;
    }
   }
   await wait(250);
  }
  result.success=result.compared>=10&&result.matched/result.compared>=.7&&result.highlight_pairs>0&&result.stale_marker_pairs===0;
 }catch(e){result.error=e.stack;}
 finally{fs.writeFileSync('docs/live-targets-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
});
setTimeout(()=>{b.quit();process.exit(1);},65000).unref();

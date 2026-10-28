// Read-only live survey check. No terrain, inventory or model changes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),{scanTrees}=require('../controller/target_scan');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabScanCheck',version:'1.21.4'}),result={fixture:'Read-only hover survey above the reported ocean site; return to the existing staging pad afterward'};
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const message=await r.text();if(!message.includes('not online'))throw Error(message);await wait(500);}throw Error('Temporary observer was not listed online');}
let finished=false;
async function finish(){if(finished)return;finished=true;survey.release(b);fs.writeFileSync('docs/natural-tree-scan-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 survey.hold(b);await wait(1800);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:24628.5,y:65,z:16480.5});await wait(2500);
 const measure=fn=>{const at=performance.now(),value=fn();return {ms:Math.round((performance.now()-at)*10)/10,count:value.length};};
 result.fixture='Read-only tree acquisition profiling in the active natural-resource site';
 result.block_search=measure(()=>b.findBlocks({matching:block=>block.name.endsWith('_log'),useExtraInfo:block=>Math.abs(block.position.y-b.entity.position.y)<5,maxDistance:64,count:256}));
 const begin=performance.now(),loaded=await require('../controller/resource_scan').logs(b);result.loaded_column_search={ms:Math.round((performance.now()-begin)*10)/10,count:loaded.length};
 result.ray_search=measure(()=>scanTrees(b,48));result.position=b.entity.position.clone();result.success=true;
 }catch(error){result.error=error.stack;}finally{await finish();}});
setTimeout(()=>{result.error='Survey verification deadline';finish();},60000).unref();

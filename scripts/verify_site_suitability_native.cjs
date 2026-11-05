// Read-only live site audit; no training accounts, blocks, items or models changed.
const fs=require('fs'),assert=require('assert/strict'),m=require('mineflayer'),{once}=require('events'),{claimPlot}=require('../controller/hut_teacher'),{inspect}=require('../controller/site_suitability');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=m.createBot({host:'127.0.0.1',port:25565,username:'LabSiteSurvey',version:'1.21.4',auth:'offline'}),reports=[];b.on('error',console.error);
async function admin(data){for(let i=0;i<20;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();await wait(300);}throw Error('Survey account unavailable');}
(async()=>{let original,mode;try{await once(b,'spawn');await wait(1200);original=b.entity.position.clone();mode=b.game.gameMode;await admin({action:'gamemode',gamemode:'spectator'});b.physicsEnabled=false;
 for(const site of (process.argv.includes('--site=2')?[2]:[3,5,0,2,4,6,7,8,1])){
  const x=16384+site*4096,world={bounds:[x-16,x+144,16368,16528],count:8,spread:12},run='native-site-'+site+'-'+Date.now();
  await admin({action:'teleport-coordinates',x:x+64.5,y:196,z:16448.5});await wait(1500);await b.waitForChunksToLoad();
  const at=Date.now(),plots=[];for(let index=0;index<8;index++){const p=claimPlot(b,{...world,index},run);if(p)plots.push(p);else break;}
  let audit=inspect(b,world,plots);for(let retry=0;!audit.complete&&retry<4;retry++){await wait(2000);audit=inspect(b,world,plots);}
  const report={site,elapsed_ms:Date.now()-at,...audit};reports.push(report);
  if(site===3){assert.equal(report.ok,false,'reported ocean site must be rejected');assert.ok(report.plots<8);}
  if(report.ok)break;
 }
 console.log(JSON.stringify({read_only:true,reports}));
}catch(e){console.error(e);process.exitCode=1;}finally{if(original)await admin({action:'teleport-coordinates',x:original.x,y:original.y,z:original.z}).catch(()=>{});if(mode)await admin({action:'gamemode',gamemode:mode}).catch(()=>{});b.quit();fs.writeFileSync('logs/site-suitability-native.json',JSON.stringify({read_only:true,cleaned:true,reports},null,2));setTimeout(()=>process.exit(process.exitCode||0),300);}})().catch(e=>{console.error(e);b.quit();process.exit(1)});

'use strict';
// Natural-terrain acquisition smoke, not the seven-day hostile survival demo.
// World creation and first admission are setup; no items/buildings are supplied.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PilotSupervisor,HttpBridge}=require('../pilot/index.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||'logs/persistent-pilot-acquisition');
if(!out.startsWith(path.join(root,'logs')+path.sep))throw Error('Evidence belongs under logs');
const token=process.env.PILOT_FIXTURE_TOKEN_FILE;if(!token)throw Error('Private fixture token file required');
const suffix=process.env.PILOT_ACQUIRE_SUFFIX||'';if(!/^[a-z0-9_]{0,8}$/.test(suffix))throw Error('Invalid fixture suffix');
const world='lab_pilot_fixture_acquire'+suffix,identity='PilotTest04',bridge=new HttpBridge('http://127.0.0.1:8102',token);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));fs.mkdirSync(out,{recursive:true});
const report={started:Date.now(),world,identity,seed:20261125,items_supplied:0,buildings_supplied:0,
  fixture_mob_spawning:false,claim:'unseeded natural-terrain acquisition only',complete:false,samples:0};
report.sources=Object.fromEntries(['pilot/index.cjs','pilot/life.cjs','pilot/state.cjs'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const write=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
let s,pulsing=false;const pulse=async()=>{if(!s||pulsing)return;pulsing=true;try{await s.pulse();}finally{pulsing=false;}};
const timer=setInterval(()=>pulse().catch(e=>{report.heartbeat_error=e.message;}),500);
async function main(){
  report.realm=await bridge.world({action:'create',world,terrain:'normal',seed:report.seed});
  s=new PilotSupervisor({fixture:true,world,identity,serverPort:25571,bridge,directory:path.join(out,'state'),logs:path.join(out,'events')});
  await s.start();await pulse();let end=Date.now()+25000;
  while(!s.ready&&Date.now()<end)await sleep(200);assert(s.ready,'Verified native admission required');
  report.admission=await bridge.world({action:'player',world,player:identity});assert.equal(report.admission.inventory.length,0);
  end=Date.now()+10*60000;let at=0;
  while(Date.now()<end){
    if(s.resourceHold||!s.ready)throw Error('Acquisition interrupted by resource/lifecycle guard: '+s.reason);
    let timeout;try{await Promise.race([s.decision(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Native decision bound')),65000);})]);}finally{clearTimeout(timeout);}
    if(Date.now()-at>=2000){at=Date.now();const snapshot=s.status();report.latest=snapshot;report.samples++;
      fs.appendFileSync(path.join(out,'samples.jsonl'),JSON.stringify({at,...snapshot})+'\n');write();}
    if(s.life.established){report.complete=true;report.stop_reason='Owned home physically verified from genuine acquisition';break;}
    await sleep(200);
  }
  if(!report.complete)report.stop_reason='Ten-minute acquisition budget reached; partial progress only';
}
main().catch(e=>{report.error=e.stack||e.message;process.exitCode=1;}).finally(async()=>{clearInterval(timer);
  try{if(s){report.latest=s.status();await s.close({preserveEnabled:false});await sleep(1600);}
    const p=await bridge.world({action:'player',world,player:identity});assert.equal(p.online,false);
    await bridge.world({action:'unload',world});await bridge.world({action:'retire',world});report.cleanup_verified=true;
  }catch(e){report.cleanup_error=e.message;process.exitCode=1;}
  report.finished=Date.now();report.elapsed_seconds=(report.finished-report.started)/1000;write();console.log(JSON.stringify({complete:report.complete,stop_reason:report.stop_reason,error:report.error,cleanup:report.cleanup_verified,elapsed_seconds:report.elapsed_seconds}));});

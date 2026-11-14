// Narrow dashboard contract for the native pre-release check only.
const http=require('node:http');
const FIXTURE_HEALTH_PATH='/fixture/health';
const FIXTURE_HEALTH_HOST='localhost:8000';
const FIXTURE_HEALTH_PROTOCOL='fixture-health-v1';
const MAX_SAMPLE_AGE_MS=5000;
const MAX_FUTURE_SKEW_MS=100;
const MAX_RESPONSE_BYTES=4096;

function normalizeFixtureHealth(state,expectedPid,now=Date.now()){
 const server=state?.server,persistence=state?.performance?.persistence;
 const sampledAt=state?.sampled_at_ms,ram=state?.ram_percent;
 if(state?.protocol!==FIXTURE_HEALTH_PROTOCOL||!Number.isSafeInteger(sampledAt)||sampledAt<=0||
    now-sampledAt>MAX_SAMPLE_AGE_MS||sampledAt-now>MAX_FUTURE_SKEW_MS){
  return {sampled_at_ms:now,unavailable:'Invalid or stale fixture health sample'};
 }
 const healthy=Number.isSafeInteger(expectedPid)&&expectedPid>0&&server?.pid===expectedPid&&
  server.ready===true&&server.busy===false&&server.desired_running===true&&
  server.error===null&&server.bots_online===8&&state.stopped===false&&
  Number.isFinite(ram)&&ram>=0&&ram<86&&persistence?.error===null&&
  Number.isSafeInteger(persistence.pending)&&persistence.pending>=0&&
  Number.isSafeInteger(persistence.capacity)&&persistence.capacity>0;
 const sample={sampled_at_ms:sampledAt,pid:server?.pid,ready:server?.ready,busy:server?.busy,
  bots_online:server?.bots_online,ram_percent:ram,persistence_error:persistence?.error,
  persistence_pending:persistence?.pending,world_phase:state.world_training?.session?.phase,
  learning:state.world_learning?.phase};
 if(!healthy)sample.unavailable='Unhealthy or invalid fixture health sample';
 return sample;
}

function sampleFixtureHealth(timeoutMs,expectedPid){
 const signal=AbortSignal.timeout(timeoutMs);
 return new Promise(resolve=>{
  const unavailable=reason=>resolve({sampled_at_ms:Date.now(),unavailable:reason});
  const failed=error=>unavailable(signal.aborted?signal.reason.name:error.name);
  const request=http.request({hostname:'127.0.0.1',port:8000,path:FIXTURE_HEALTH_PATH,agent:false,
   signal,headers:{Host:FIXTURE_HEALTH_HOST}},response=>{
   response.on('error',failed);
   if(response.statusCode!==200){
    unavailable('HTTP '+response.statusCode);
    response.destroy();
    return;
   }
   const chunks=[];
   let bytes=0;
   response.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>MAX_RESPONSE_BYTES){
     unavailable('Fixture health response exceeded 4096 bytes');
     response.destroy();
    }else chunks.push(chunk);
   });
   response.on('end',()=>{
    try{resolve(normalizeFixtureHealth(JSON.parse(Buffer.concat(chunks).toString('utf8')),expectedPid));}
    catch(error){failed(error);}
   });
  });
  request.on('error',failed);
  request.end();
 });
}

module.exports={FIXTURE_HEALTH:FIXTURE_HEALTH_PROTOCOL,sampleFixtureHealth,normalizeFixtureHealth};

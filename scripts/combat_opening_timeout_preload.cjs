// Only the disposable probe process sees these synthetic dashboard failures.
const realFetch=global.fetch;
const mode=process.env.COMBAT_TIMEOUT_PROBE;
const narrow=process.env.COMBAT_NARROW_CONTRACT_PROBE==='1';
if(!['recover','exhaust'].includes(mode))throw Error('Expected recover or exhaust probe');
let mocked=0;
const faultLimit=mode==='recover'?1:3;
const onceAborted=(signal,callback)=>{
 if(signal.aborted)callback();
 else signal.addEventListener('abort',callback,{once:true});
};
global.fetch=async function(url,options){
 const address=new URL(url);
 if(address.origin==='http://127.0.0.1:8000'){
  if(!narrow&&address.pathname==='/status'&&address.search==='?compact=true'&&mocked<faultLimit){
   mocked++;
   await new Promise((_,reject)=>onceAborted(options.signal,()=>reject(options.signal.reason)));
  }
  if(mode==='exhaust'&&mocked&&address.pathname==='/admin/action'){
   throw Error('Synthetic dashboard outage extended to admin endpoints');
  }
 }
 return realFetch(url,options);
};

if(narrow){
 const http=require('node:http'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
 const realRequest=http.request;
 http.request=function(options,callback){
  if(options.hostname!=='127.0.0.1'||Number(options.port)!==8000||options.path!=='/fixture/health'){
   return realRequest.apply(this,arguments);
  }
  const request=new EventEmitter();
  request.destroy=()=>{};
  request.end=async()=>{
   try{
    const signal=options.signal;
    if(mocked<faultLimit){
     mocked++;
     await new Promise((_,reject)=>onceAborted(signal,()=>reject(signal.reason)));
    }
    // The candidate route is not deployed. Shape real current status into the
    // contract only inside this fault-injection process, never for a fight.
    const reply=await realFetch('http://127.0.0.1:8000/status?compact=true',{signal});
    const state=await reply.json();
    const body=JSON.stringify({protocol:'fixture-health-v1',sampled_at_ms:Date.now(),
     server:state.server,ram_percent:state.ram_percent,performance:{persistence:state.performance.persistence},
     stopped:require('node:fs').existsSync('data/lab-stopped'),
     world_training:{session:{phase:state.world_training.session?.phase}},
     world_learning:{phase:state.world_learning.phase}});
    const stream=Readable.from([Buffer.from(body)]);
    stream.statusCode=reply.status;
    callback(stream);
   }catch(error){request.emit('error',error);}
  };
  return request;
 };
}

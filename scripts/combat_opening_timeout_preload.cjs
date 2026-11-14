// Only the disposable probe process sees these synthetic dashboard failures.
const realFetch=global.fetch;
const mode=process.env.COMBAT_TIMEOUT_PROBE;
if(!['recover','exhaust'].includes(mode))throw Error('Expected recover or exhaust probe');
let mocked=0;
global.fetch=async function(url,options){
 const address=new URL(url);
 if(address.origin==='http://127.0.0.1:8000'){
  if(address.pathname==='/status'&&address.search==='?compact=true'&&mocked<(mode==='recover'?1:3)){
   mocked++;
   await new Promise((_,reject)=>{
    const signal=options.signal;
    if(signal.aborted)reject(signal.reason);
    else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
   });
  }
  if(mode==='exhaust'&&mocked&&address.pathname==='/admin/action'){
   throw Error('Synthetic dashboard outage extended to admin endpoints');
  }
 }
 return realFetch(url,options);
};

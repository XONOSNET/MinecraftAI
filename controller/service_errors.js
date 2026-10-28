// Brief local transport failures pause an intention; they are not skill failures.
function transient(error){return ['AbortError','TimeoutError'].includes(error?.name)||error?.message==='fetch failed'||['ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.cause?.code)||error?.status>=500;}
function recover(state,error,now=Date.now()){
 if(!transient(error))return false;
 state.serviceFailureSince??=now;
 if(now-state.serviceFailureSince>=30000){state.failureCategory='infrastructure';return false;}
 state.serviceRetryAt=now+500;state.message='Local AI connection interrupted; waiting briefly and retrying this step';return true;
}
module.exports={transient,recover};

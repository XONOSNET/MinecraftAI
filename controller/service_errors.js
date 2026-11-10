// Brief local transport failures pause an intention; they are not skill failures.
function craftingTimeout(error){return ['Timed out synchronizing crafting inventory','Crafting table did not open'].includes(error?.message);}
function furnaceTimeout(error){return error?.message==='Furnace inventory acknowledgement timed out';}
function transient(error){return error?.code==='BUILD_STATION_CHANGED'||craftingTimeout(error)||furnaceTimeout(error)|| ['AbortError','TimeoutError'].includes(error?.name)||error?.message==='fetch failed'||['ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.cause?.code)||error?.status>=500;}
function recover(state,error,now=Date.now()){
 if(!transient(error))return false;
 state.serviceFailureSince??=now;
 if(now-state.serviceFailureSince>=30000){state.failureCategory='infrastructure';return false;}
 state.serviceRetryAt=now+500;state.message=error?.code==='BUILD_STATION_CHANGED'?'Workstation changed; rechecking repairs before continuing':furnaceTimeout(error)?'Furnace response timed out; reopening and checking server-confirmed contents':craftingTimeout(error)?'Crafting response timed out; retrying this step with server-confirmed inventory':'Local AI connection interrupted; waiting briefly and retrying this step';return true;
}
module.exports={transient,recover,craftingTimeout};

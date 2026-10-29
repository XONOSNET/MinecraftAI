// A hung native interaction must not keep a previous world controller alive.
function createGuard(retire,{clock=()=>Date.now(),timeout=180000}={}){
 let started=null,closed=false;
 return {
  begin(){started=clock();},end(){started=null;},closed:()=>closed,
  dispose(){closed=true;},
  close(reason){if(closed)return;closed=true;retire(reason);},
  check(assignment,run){
   if(closed||started===null)return;
   if(assignment?.run&&assignment.run!==run)this.close('World assignment changed while a native action was pending');
   else if(clock()-started>timeout)this.close('Native controller action exceeded '+timeout/1000+' seconds');
  }
 };
}
module.exports={createGuard};

// Wall-clock timings describe controller behavior, not neural thought.
class WorldTiming{
 constructor(now){this.at=now;this.started=now;this.phase='survey';this.activity='waiting';this.phases={};this.activities={};this.firstLog=null;this.turn=null;this.turnAt=0;this.reversals=0;this.targets=0;this.replans=0;}
 mark(phase,activity,now=Date.now()){
  const dt=Math.max(0,now-this.at)/1000;
  this.phases[this.phase]=(this.phases[this.phase]||0)+dt;this.activities[this.activity]=(this.activities[this.activity]||0)+dt;
  this.at=now;this.phase=phase;this.activity=activity;
 }
 action(action,now=Date.now()){
  if(action!==1&&action!==2)return;
  if(this.turn!==null&&this.turn!==action&&now-this.turnAt<2000)this.reversals++;
  this.turn=action;this.turnAt=now;
 }
 snapshot(logs,now=Date.now()){
  this.mark(this.phase,this.activity,now);
  if(logs>0&&this.firstLog===null)this.firstLog=(now-this.started)/1000;
  const rounded=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Math.round(v*10)/10]));
  return {phase_seconds:rounded(this.phases),activity_seconds:rounded(this.activities),first_log_seconds:this.firstLog===null?null:Math.round(this.firstLog*10)/10,turn_reversals:this.reversals,target_switches:this.targets,route_replans:this.replans};
 }
}
function treeFocus(targets,previous){
 const key=v=>v.x+','+v.z;
 const selected=targets.find(v=>key(v)===previous)||targets[0];
 return selected?{key:key(selected),targets:targets.filter(v=>key(v)===key(selected))}:{key:null,targets:[]};
}
module.exports={WorldTiming,treeFocus};

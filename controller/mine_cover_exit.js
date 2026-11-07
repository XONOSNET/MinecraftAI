// Reach the surface through recorded stairs before searching for earth cover.
async function tick(t,b,motor,state,api,scan,tasks,kind){
 const n=t.wilderness,m=n?.mine;
 if(!m||m.stage==='done')return false;
 if(!m.coverExit){
  if(!['seek cover','retreat'].includes(kind)||b.entity.position.y>=m.entry[1]-.5)return false;
  m.coverExit=true;m.stage='exit';m.exitIndex=m.path.length-1;
  n.coverResume??=t.phase;t.phase='night_seek_cover';
  t.path=[];t.navigator.lastPlan=-Infinity;
 }
 // Reuse sensed, reversible stair routing and its changed-footing guards.
 // This cursor survives daylight or a pending jump without restarting mining.
 await require('./staircase_mining').tick(t,b,motor,state,api,scan,tasks);
 t.message='Leaving the mine by recorded stairs before seeking night cover';
 return true;
}
module.exports={tick};

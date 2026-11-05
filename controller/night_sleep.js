// Real bed interactions; a successful sleep request alone never credits survival.
const house=require('./house');
function observe(t,b){
 const s=t.wilderness.sleep??={status:'Waiting for night',night_seen:false,morning_seen:false,retry_at:0};
 const time=b.time?.timeOfDay;
 if(Number.isFinite(time)){
  if(time>=12541&&time<=23458)s.night_seen=true;
  if(s.night_seen&&time>=0&&time<12000)s.morning_seen=true;
 }
 return s;
}
async function wake(t,b,motor,now=Date.now()){
 if(!b.isSleeping)return false;
 motor.pause();const s=t.wilderness.sleep??={};
 s.status='Waking before continuing';t.message=s.status;
 if(now>=(s.wake_retry_at||0)){
  s.wake_retry_at=now+5000;
  try{await b.wake();}catch(error){s.status='Waiting to wake: '+error.message;t.message=s.status;}
 }
 return true;
}
async function tick(t,b,motor,walk,now=Date.now()){
 motor.pause();const s=observe(t,b),time=b.time?.timeOfDay;
 const status=text=>{s.status=text;t.wilderness.priority='Shelter watch';t.wilderness.reason=text;return text;};
 if(b.isSleeping)return status('Sleeping in home bed · waiting for morning');
 if(!Number.isFinite(time))return status('Sheltered · waiting for server time');
 if(time<12541||time>23458)return status(s.morning_seen?'Morning verified · finishing survival watch':s.night_seen?'Sheltered · waiting for dawn':'Sheltered · waiting for night');
 // A recorded morning proves survival, but must not suppress bed use on a
 // later night while the full watch is still in progress.
 if(!['overworld','minecraft:overworld'].includes(b.game?.dimension))return status('Sheltered · sleeping is unsafe outside the Overworld');
 if(now<s.retry_at)return status(s.status);
 const bed=b.blockAt(house.point(t.plot,'bed')),head=b.blockAt(house.point(t.plot,'bed').offset(0,0,1));
 const blocked=text=>{s.retry_at=now+10000;return status('Sheltered · '+text);};
 if(!bed?.name.endsWith('_bed')||!head?.name.endsWith('_bed'))return blocked('home bed is missing or unloaded');
 if(bed.getProperties().occupied||head.getProperties().occupied)return blocked('home bed is occupied');
 // Always approach our own bedside, never another bot's bed or a random bed.
 const stance=[t.plot.x+1.5,t.plot.y+.1,t.plot.z+.5];
 if(b.entity.position.distanceTo(bed.position.offset(.5,.5,.5))>2.5){
  if(await walk(stance)===false)return blocked('home bed approach is blocked');
  return status('Walking to home bed');
 }
 try{
  await b.sleep(bed);
  if(!b.isSleeping)return blocked('server has not confirmed sleeping');
  return status('Sleeping in home bed · waiting for morning');
 }catch(error){return blocked('cannot sleep: '+String(error.message).slice(0,160));}
}
module.exports={observe,wake,tick};

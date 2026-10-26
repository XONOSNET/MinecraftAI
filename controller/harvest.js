const {forBot}=require('./behavior');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
async function aim(bot,point){
 const p=bot.entity.position,dx=point.x-p.x,dz=point.z-p.z,dy=point.y-p.y-(bot.entity.eyeHeight||1.62);
 const rules=forBot(bot),yawStep=rules.aim_yaw_deg_per_sec*Math.PI/180*.05,pitchStep=rules.aim_pitch_deg_per_sec*Math.PI/180*.05;
 const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
 for(let i=0;i<80;i++){
  const dyaw=wrap(yaw-bot.entity.yaw),dp=pitch-bot.entity.pitch;
  if(Math.abs(dyaw)<.01&&Math.abs(dp)<.01)return;
  const limit=(v,n)=>Math.sign(v)*Math.min(Math.abs(v),n);
  await Promise.all([bot.look(bot.entity.yaw+limit(dyaw,yawStep),bot.entity.pitch+limit(dp,pitchStep),true),wait(50)]);
 }
}
async function level(bot){
 const p=bot.entity.position,yaw=bot.entity.yaw;
 await aim(bot,p.offset(-Math.sin(yaw)*4,bot.entity.eyeHeight||1.62,-Math.cos(yaw)*4));
}
// Confirm real server block removal; use the equipped tool's native break time.
async function harvest(bot,block){
 if(!block||!block.name.endsWith('_log')&&block.name!=='stone')return false;
 for(let i=0;i<10&&(!bot.entity.onGround||Math.abs(bot.entity.velocity?.y||0)>.05);i++)await new Promise(r=>setTimeout(r,100));
 if(!bot.entity.onGround)return false;
 await aim(bot,block.position.offset(.5,.5,.5));
 if(bot.blockAt&&bot.blockAt(block.position)?.name!==block.name){await level(bot);return false;}
 const duration=Math.max(100,bot.digTime(block)+100),sequence=(bot.labHarvestSequence||0)+1;bot.labHarvestSequence=sequence;
 let swing,timeout,listener;
 const removed=new Promise(resolve=>{
  listener=(old,next)=>{if(next?.position?.equals(block.position)&&next.name==='air')resolve(true);};
  bot.on('blockUpdate',listener);timeout=setTimeout(()=>resolve(false),duration+4000);
 });
 try{
  bot._client.write('block_dig',{status:0,location:block.position,face:1,sequence});bot.swingArm();swing=setInterval(()=>bot.swingArm(),350);
  await new Promise(r=>setTimeout(r,duration));
  bot._client.write('block_dig',{status:2,location:block.position,face:1,sequence});
  return await removed;
 }finally{clearInterval(swing);clearTimeout(timeout);bot.removeListener('blockUpdate',listener);}
}
module.exports={harvest,aim,level};

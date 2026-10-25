// Confirm real server block removal before treating a harvest as completed.
async function harvest(bot,block){
 if(!block||!block.name.endsWith('_log'))return false;
 for(let i=0;i<10&&(!bot.entity.onGround||Math.abs(bot.entity.velocity?.y||0)>.05);i++)await new Promise(r=>setTimeout(r,100));
 if(!bot.entity.onGround)return false;
 await bot.lookAt(block.position.offset(.5,.5,.5),true);
 const duration=Math.max(3200,bot.digTime(block)+200),sequence=(bot.labHarvestSequence||0)+1;bot.labHarvestSequence=sequence;
 let swing,timeout,listener;
 const removed=new Promise(resolve=>{
  listener=(old,next)=>{if(next?.position?.equals(block.position)&&next.name==='air')resolve(true);};
  bot.on('blockUpdate',listener);timeout=setTimeout(()=>resolve(false),duration+4000);
 });
 try{
  bot._client.write('block_dig',{status:0,location:block.position,face:1,sequence});bot.swingArm();swing=setInterval(()=>bot.swingArm(),350);
  await new Promise(r=>setTimeout(r,duration));
  bot._client.write('block_dig',{status:2,location:block.position,face:1,sequence});
  const success=await removed;if(success)await new Promise(r=>setTimeout(r,300));return success;
 }finally{clearInterval(swing);clearTimeout(timeout);bot.removeListener('blockUpdate',listener);}
}
module.exports={harvest};

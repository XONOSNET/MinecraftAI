// A bounded physical jump, followed by a falling swing; no damage commands.
const {Vec3}=require('vec3');
function safeJump(bot,task){
 const e=bot.entity,p=e?.position;
 if(!p||e.onGround!==true||e.isInWater||e.isInLava||bot.vehicle||bot.health<=8||!bot.blockAt||!bot.setControlState)return false;
 const blindness=bot.registry?.effectsByName?.Blindness?.id;
 if(blindness!==undefined&&e.effects?.[blindness])return false;
 const floor=Math.floor(p.y-.05);
 for(const dx of [-.6,0,.6])for(const dz of [-.6,0,.6]){
  const x=p.x+dx,z=p.z+dz,b=task.bounds;
  if(b&&(x<=b[0]+.4||x>=b[1]-.4||z<=b[2]+.4||z>=b[3]-.4))return false;
  const support=bot.blockAt(new Vec3(Math.floor(x),floor,Math.floor(z)));
  if(!support||support.boundingBox!=='block'||['magma_block','campfire','cactus'].includes(support.name))return false;
 }
 for(let x=Math.floor(p.x-.3);x<=Math.floor(p.x+.3);x++)for(let z=Math.floor(p.z-.3);z<=Math.floor(p.z+.3);z++)for(let y=Math.floor(p.y);y<=Math.floor(p.y+3.05);y++){
  const b=bot.blockAt(new Vec3(x,y,z));if(!b||b.boundingBox!=='empty'||['water','lava','fire','cobweb','ladder','vine','powder_snow'].includes(b.name))return false;
 }
 return true;
}
async function fall(bot,task){
 if(!safeJump(bot,task))return null;
 const state={until:Date.now()+950,airborne:false,peak:bot.entity.position.y,cancelled:false};bot.labCriticalAttack=state;
 for(const k of ['sprint','forward','back','left','right','sneak'])bot.setControlState(k,false);
 bot.setControlState('jump',true);
 while(Date.now()<state.until&&!state.cancelled&&bot.health>8&&bot.entity){
  if(bot.entity.onGround===false){state.airborne=true;state.peak=Math.max(state.peak,bot.entity.position.y);bot.setControlState('jump',false);if(bot.entity.velocity?.y<-.12&&state.peak-bot.entity.position.y>.15)return state;}
  if(state.airborne&&bot.entity.onGround)return state;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 return state;
}
function finish(bot,state){if(!state)return;state.cancelled=true;if(bot.labCriticalAttack===state)bot.labCriticalAttack=null;bot.setControlState('jump',false);}
module.exports={safeJump,fall,finish};

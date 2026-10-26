// Close crossed wooden doors using normal interactions, without turning the head.
const {Vec3}=require('vec3');
const locks=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));
function lower(bot,block){
 if(!block?.name.endsWith('_door')||block.name==='iron_door')return null;
 return block.getProperties().half==='upper'?bot.blockAt(block.position.offset(0,-1,0)):block;
}
function geometry(block){const axis=['north','south'].includes(block.getProperties().facing)?'z':'x';return {axis,cross:axis==='x'?'z':'x',plane:block.position[axis]+.5};}
function occupied(bot,block){
 const d=geometry(block),p=block.position;
 const people=[bot.entity,...Object.values(bot.players||{}).filter(v=>v.entity&&v.entity.id!==bot.entity.id&&v.gamemode!==3&&v.gamemode!=='spectator').map(v=>v.entity)];
 return people.some(e=>Math.abs(e.position.y-p.y)<1.8&&Math.abs(e.position[d.axis]-d.plane)<.9&&Math.abs(e.position[d.cross]-p[d.cross]-.5)<.85);
}
async function closeDoor(bot,block){
 block=lower(bot,block);if(!block)return false;
 if(!block.getProperties().open)return true;
 if(occupied(bot,block)||bot.getControlState?.('sneak')||block.position.offset(.5,.5,.5).distanceTo(bot.entity.position.offset(0,1.62,0))>4.5)return false;
 if(bot.canSeeBlock&&!bot.canSeeBlock(block))return false;
 const key=(bot.game?.dimension||'overworld')+':'+block.position.toString(),now=Date.now();
 if((locks.get(key)||0)>now)return false;
 // Remove expired locks so long-running production worlds do not accumulate doors.
 for(const [id,until] of locks)if(until<=now)locks.delete(id);
 locks.set(key,now+1000);
 if(bot.version==='1.21.4'&&bot._client){
  bot._client.write('block_place',{location:block.position,direction:1,hand:0,cursorX:.5,cursorY:.5,cursorZ:.5,insideBlock:false,sequence:0,worldBorderHit:false});bot.swingArm();
 }else await bot.activateBlock(block);
 for(let i=0;i<24;i++){
  const current=lower(bot,bot.blockAt(block.position));
  if(!current)return false;
  if(!current.getProperties().open)return true;
  await wait(25);
 }
 return false;
}
function createDoorCare(bot){
 const tracked=new Map();let scanned=-Infinity;
 function reset(){tracked.clear();scanned=-Infinity;}
 async function update(now=Date.now()){
  if(!bot.entity||bot.health<=0)return;
  const p=bot.entity.position;
  if(now-scanned>=150){
   scanned=now;
   for(let x=Math.floor(p.x)-2;x<=Math.floor(p.x)+2;x++)for(let z=Math.floor(p.z)-2;z<=Math.floor(p.z)+2;z++){
    const block=lower(bot,bot.blockAt(new Vec3(x,Math.floor(p.y),z)));
    if(!block?.getProperties().open)continue;
    const d=geometry(block),offset=p[d.axis]-d.plane,id=block.position.toString();
    if(!tracked.has(id)&&Math.abs(offset)>.35&&Math.abs(offset)<2.5&&Math.abs(p[d.cross]-block.position[d.cross]-.5)<.85)
     tracked.set(id,{position:block.position.clone(),last:p.clone(),crossed:false,side:Math.sign(offset),...d,at:now});
   }
  }
  for(const [id,d] of tracked){
   const block=lower(bot,bot.blockAt(d.position));
   if(!block?.getProperties().open||now-d.at>30000||p.distanceTo(d.position)>6){tracked.delete(id);continue;}
   const before=d.last[d.axis]-d.plane,after=p[d.axis]-d.plane;
   if(before*d.side>=0&&after*d.side<0){
    const t=Math.abs(before)/(Math.abs(before)+Math.abs(after)),cross=d.last[d.cross]+(p[d.cross]-d.last[d.cross])*t;
    d.crossed=Math.abs(cross-d.position[d.cross]-.5)<.85;
   }
   d.last=p.clone();
   if(d.crossed&&after*d.side<-.9){
    if(await closeDoor(bot,block)){tracked.delete(id);return 'Closed door behind me';}
   }
  }
 }
 return {update,reset};
}
module.exports={createDoorCare,closeDoor,occupied};

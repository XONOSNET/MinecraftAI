// Runtime reservations supplement visible player positions and mining animations.
const {forBot}=require('./behavior');
const claims=new Map(),observed=new WeakMap();
const key=p=>`${Math.floor(p.x)},${Math.floor(p.z)}`;
function players(bot){return Object.values(bot.players||{}).filter(p=>p.username!==bot.username&&p.entity&&p.entity.id!==bot.entity?.id&&p.gamemode!==3&&p.gamemode!=='spectator').map(p=>p.entity.position);}
function clearOfPlayers(bot,p,radius=forBot(bot).player_clearance){return !players(bot).some(q=>Math.abs(q.y-p.y)<2.5&&Math.hypot(q.x-p.x,q.z-p.z)<radius);}
function stepClear(from,to,others,radius=2){return others.every(p=>{
 if(Math.abs(p.y-to.y)>=2.5)return true;
 const next=Math.hypot(p.x-to.x,p.z-to.z),before=Math.hypot(p.x-from.x,p.z-from.z);
 return next>=radius||before<radius&&next>before+.05;
});}
function release(owner){for(const [id,c] of claims)if(c.owner===owner)claims.delete(id);}
function busy(bot,run,p,now=Date.now()){
 for(const [id,c] of claims){if(c.until<now){claims.delete(id);continue;}if(c.run===run&&c.owner!==bot.username&&Math.hypot(c.x-p.x,c.z-p.z)<=Math.max(c.radius||2,forBot(bot).mining_clearance))return true;}
 for(const [id,c] of observed.get(bot)||[]){if(c.until<now){observed.get(bot).delete(id);continue;}if(Math.hypot(c.x-p.x,c.z-p.z)<=Math.max(c.radius||2,forBot(bot).mining_clearance))return true;}
 // A high log still belongs to the ground-level work area beneath it.
 return !clearOfPlayers(bot,{x:p.x,y:bot.entity.position.y,z:p.z});
}
function reserve(bot,run,p,now=Date.now()){
 if(busy(bot,run,p,now))return false;
 release(bot.username);claims.set(`${run}:${bot.username}`,{owner:bot.username,run,x:p.x,z:p.z,until:now+forBot(bot).reservation_seconds*1000,radius:forBot(bot).mining_clearance});return true;
}
function attach(bot){
 const mining=new Map();observed.set(bot,mining);
 bot.on('blockBreakProgressObserved',(block,stage,entity)=>{if(block&&entity?.id!==bot.entity?.id)mining.set(key(block.position),{x:block.position.x+.5,z:block.position.z+.5,until:Date.now()+5000});});
 bot.on('blockBreakProgressEnd',block=>{if(block)mining.delete(key(block.position));});
 bot.on('end',()=>release(bot.username));bot.on('death',()=>release(bot.username));
}
module.exports={players,clearOfPlayers,stepClear,busy,reserve,release,attach};

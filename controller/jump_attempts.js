// Per-trial feedback from physical jumps to checked route planning.
const LIMIT=3,COOLDOWN=120000;
const cell=q=>[Math.floor(q[0]),Math.round(q[1]),Math.floor(q[2])];
const key=(a,b)=>cell(a).join(',')+'>'+cell(b).join(',');
function scope(bot,run){if(!bot.labJumpAttempts||bot.labJumpAttempts.run!==run)bot.labJumpAttempts={run,edges:new Map()};return bot.labJumpAttempts;}
function state(bot){return bot.labJumpAttempts||scope(bot,undefined);}
function prune(s,now){for(const [k,v] of s.edges)if(now-v.at>=COOLDOWN)s.edges.delete(k);while(s.edges.size>64)s.edges.delete(s.edges.keys().next().value);}
function finish(bot,from,to,success,now=Date.now()){
 const s=state(bot);prune(s,now);const k=key(from,to);
 if(success){s.edges.delete(k);return;}
 const previous=s.edges.get(k);s.edges.set(k,{attempts:(previous?.attempts||0)+1,at:now});prune(s,now);
}
function blocked(bot,from,to,now=Date.now()){const s=state(bot);prune(s,now);return (s.edges.get(key(from,to))?.attempts||0)>=LIMIT;}
function report(bot,now=Date.now()){const s=state(bot);prune(s,now);return {attempt_limit:LIMIT,blocked_crossings:[...s.edges].filter(([,v])=>v.attempts>=LIMIT).map(([edge,v])=>({edge,attempts:v.attempts,retry_seconds:Math.ceil((COOLDOWN-now+v.at)/1000)}))};}
module.exports={scope,finish,blocked,report};

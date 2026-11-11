// Optional, local-only observer. No protocol writes and no dashboard routes.
const fs=require('node:fs/promises'),path=require('node:path');
const requestName=/^request-([A-Za-z0-9_]{1,16})$/;
function stack(item){
 if(!item||!Number.isInteger(item.count)||item.count<1||!/^\w+$/.test(item.name||''))return null;
 return {id:'minecraft:'+item.name,count:item.count};
}
function snapshot(bot,now=Date.now()){
 const inv=bot.inventory,window=bot.currentWindow;
 if(!bot.entity||!inv?.slots)return null;
 const player=Array.from({length:46},(_,i)=>stack(inv.slots[i]));
 if(window&&Number.isInteger(window.inventoryStart)&&window.inventoryStart>=0&&window.inventoryStart+36<=window.slots.length){
  for(let i=0;i<36;i++)player[9+i]=stack(window.slots[window.inventoryStart+i]);
 }
 const slots=window?window.slots.slice(0,Math.min(90,window.inventoryStart??0)).map(stack):player.slice(0,5);
 const type=window?String(window.type||'container').slice(0,80):slots.some(Boolean)?'crafting_2x2':'inventory';
 return {at:now,bot:bot.username,player,selected:bot.quickBarSlot??0,window:{type,slots},cursor:stack((window||inv).selectedItem)};
}
async function publish(root,bots,now=Date.now()){
 const dir=path.join(root,'data','inventory-observer');
 let entries;
 try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
 const requests=entries.filter(e=>e.isFile()&&requestName.test(e.name));
 if(!requests.length)return;
 const fresh=await Promise.all(requests.map(async e=>{
  try{const age=now-(await fs.stat(path.join(dir,e.name))).mtimeMs;return age>=-1000&&age<2500?requestName.exec(e.name)[1]:null;}catch(e){if(e.code==='ENOENT')return null;throw e;}
 }));
 if(!fresh.some(Boolean))return;
 const [ops,sessions]=await Promise.all(['server/ops.json','data/observers.json'].map(async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'))));
 const admins=new Set(ops.map(p=>String(p.name).toLowerCase()));
 for(const owner of fresh){
  if(!owner||!admins.has(owner.toLowerCase()))continue;
  const session=Object.values(sessions).find(s=>s.player?.toLowerCase()===owner.toLowerCase()&&s.enabled&&s.attached);
  const bot=session&&bots.find(b=>b?.username===session.target&&!b._client?.ended);
  const view=bot&&snapshot(bot,now);
  if(!view)continue;
  const file=path.join(dir,'snapshot-'+owner+'.json'),temp=file+'.'+process.pid+'.tmp';
  await fs.writeFile(temp,JSON.stringify(view),'utf8');
  await fs.rename(temp,file);
 }
}
function start(bots,root=process.cwd()){
 let busy=false;
 const timer=setInterval(async()=>{
  if(busy)return;busy=true;
  try{await publish(root,bots);}catch{/* Optional observer must not interrupt controller work. */}finally{busy=false;}
 },250);
 timer.unref();
}
module.exports={start,publish,snapshot};

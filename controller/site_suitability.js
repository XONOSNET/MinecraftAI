// Setup-only inventory of loaded natural terrain; never exposes ore coordinates to policies.
const {Vec3}=require('vec3'),house=require('./house');
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
const edible=new Set(['sheep','cow','pig','chicken','rabbit']);
function allocate(groups,plots,quota){
 // Max flow prevents one reachable grove from being counted once per bot.
 const n=groups.length+plots.length+2,end=n-1,edges=Array.from({length:n},()=>[]);
 const add=(a,b,c)=>{const f={to:b,cap:c,rev:edges[b].length},r={to:a,cap:0,rev:edges[a].length};edges[a].push(f);edges[b].push(r);};
 for(let i=0;i<groups.length;i++){const g=groups[i];add(0,1+i,g.count);for(let j=0;j<plots.length;j++)if(Math.hypot(g.x-plots[j].x,g.z-plots[j].z)<=96)add(1+i,1+groups.length+j,g.count);}
 for(let j=0;j<plots.length;j++)add(1+groups.length+j,end,quota);
 let flow=0;
 while(true){const prev=Array(n).fill(null),queue=[0];prev[0]=true;for(let i=0;i<queue.length&&!prev[end];i++)for(let k=0;k<edges[queue[i]].length;k++){const e=edges[queue[i]][k];if(e.cap>0&&!prev[e.to]){prev[e.to]=[queue[i],k];queue.push(e.to);}}
  if(!prev[end])break;let amount=Infinity;
  for(let v=end;v;v=prev[v][0]){const [a,k]=prev[v];amount=Math.min(amount,edges[a][k].cap);}
  for(let v=end;v;v=prev[v][0]){const [a,k]=prev[v],e=edges[a][k];e.cap-=amount;edges[v][e.rev].cap+=amount;}flow+=amount;
 }
 return flow;
}
function hasTreeApproach(bot,plot,groups,bounds){
 const nav=require('./field_navigation'),proxy=Object.create(bot);
 proxy.entity={...bot.entity,position:new Vec3(plot.x+.5,plot.y+.1,plot.z+.5),onGround:true,isInWater:false};
 const trees=groups.filter(g=>Math.hypot(g.x-plot.x,g.z-plot.z)<=96).sort((a,b)=>Math.hypot(a.x-plot.x,a.z-plot.z)-Math.hypot(b.x-plot.x,b.z-plot.z)).slice(0,12);
 for(const g of trees){let checked=0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const y of [g.y,g.y+1,g.y-1]){
   if(checked>=2)break;if(!nav.standable(bot,g.x+dx,y,g.z+dz))continue;checked++;
   if(nav.travelRoute(proxy,[g.x+dx+.5,y+.1,g.z+dz+.5],112,4096,true,{bounds,reversible:true}).reached)return true;
  }
 }
 return false;
}
function inspect(bot,world,plots){
 const total=world.count||8,woodPerBot=Math.ceil((house.total+44)/4),counts={logs:0,stone:0,coal:0,iron:0,sheep:0,food_animals:0},needs={logs:woodPerBot*total,stone:32*total,coal:4*total,iron:3*total,sheep:total,food_animals:total};
 const result={ok:false,complete:false,counts,needs,plots:plots.length,reason:''};
 if(plots.length<total){result.complete=true;result.reason=`Only ${plots.length}/${total} separate safe build plots`;return result;}
 if(!bot.world?.getColumn||!bot.registry?.blocksByStateId){result.reason='Waiting for loaded chunk resource data';return result;}
 const bounds=world.bounds,groups=new Map(),types=new Map(),local=new Vec3(0,0,0);let loaded=0,expected=0,coreLoaded=0,coreExpected=0;
 const margin=require('../config/world-resources.json').expedition_margin||16;
 const kind=id=>{if(!types.has(id)){const name=bot.registry.blocksByStateId[id]?.name||'';types.set(id,LOG.test(name)?'logs':name==='stone'?'stone':/^(deepslate_)?coal_ore$/.test(name)?'coal':/^(deepslate_)?iron_ore$/.test(name)?'iron':null);}return types.get(id);};
 for(let cx=Math.floor(bounds[0]/16);cx<Math.ceil(bounds[1]/16);cx++)for(let cz=Math.floor(bounds[2]/16);cz<Math.ceil(bounds[3]/16);cz++){
  expected++;const core=cx*16+8>=bounds[0]+margin&&cx*16+8<bounds[1]-margin&&cz*16+8>=bounds[2]+margin&&cz*16+8<bounds[3]-margin;if(core)coreExpected++;
  const column=bot.world.getColumn(cx,cz);if(!column)continue;loaded++;if(core)coreLoaded++;
  for(let i=0;i<column.sections.length;i++){
   const section=column.sections[i],base=(bot.game.minY??-64)+i*16;if(!section||base>190)continue;
   if(section.palette&&!section.palette.some(id=>{const k=kind(id);return k&&(k==='logs'||counts[k]<needs[k]);}))continue;
   for(let y=0;y<16&&base+y<=190;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++){
    const wx=cx*16+x,wz=cz*16+z;if(wx<bounds[0]||wx>=bounds[1]||wz<bounds[2]||wz>=bounds[3])continue;
    local.x=x;local.y=base+y;local.z=z;const k=kind(column.getBlockStateId(local));if(!k)continue;
    if(k!=='logs'){if(counts[k]<needs[k])counts[k]++;continue;}
    counts.logs++;const key=wx+','+wz,g=groups.get(key)||{x:wx,y:base+y,z:wz,count:0};g.y=Math.min(g.y,base+y);g.count++;groups.set(key,g);
   }
  }
 }
 result.loaded_chunks=loaded;result.expected_chunks=expected;result.loaded_core_chunks=coreLoaded;result.expected_core_chunks=coreExpected;
 for(const e of Object.values(bot.entities||{}))if(e.isValid!==false&&edible.has(e.name)&&e.position.x>=bounds[0]&&e.position.x<bounds[1]&&e.position.z>=bounds[2]&&e.position.z<bounds[3]){counts.food_animals++;if(e.name==='sheep')counts.sheep++;}
 const herd=world.setup_livestock,age=Date.now()/1000-herd?.verified_at;
 if(herd&&Number.isInteger(herd.sheep)&&herd.sheep>=0&&herd.sheep<=32&&Number.isFinite(age)&&age>=-1&&age<=8){
  // Sheep are also edible. max avoids counting the same visible entities twice.
  counts.sheep=Math.max(counts.sheep,herd.sheep);counts.food_animals=Math.max(counts.food_animals,herd.sheep);result.livestock_source='Verified reserved-region server count';
 }
 result.allocated_logs=allocate([...groups.values()],plots,woodPerBot);result.complete=true;
 const missing=Object.keys(needs).filter(k=>counts[k]<needs[k]);if(result.allocated_logs<needs.logs&&!missing.includes('logs'))missing.push('distributed wood');
 if(!missing.length){result.reachable_wood_plots=plots.filter(plot=>hasTreeApproach(bot,plot,[...groups.values()],bounds)).length;if(result.reachable_wood_plots<total)missing.push('checked tree approaches '+result.reachable_wood_plots+'/'+total);}
 result.ok=!missing.length;
 if(!result.ok&&(coreExpected?coreLoaded<coreExpected*.85:loaded<expected*.75)){result.complete=false;result.reason=`Waiting for resource survey chunks ${loaded}/${expected}`;return result;}
 if(!result.ok)result.survey_reason='Checking natural starting resources for '+total+' bots · '+missing.map(k=>k==='distributed wood'||k.startsWith('checked tree')?k:`${k} ${counts[k]}/${needs[k]} observed`).join(', ')+' · survey still in progress';
 result.reason=result.ok?'Natural starting resources checked for the full roster':`Site lacks starting resources for ${total} bots: ${missing.map(k=>k==='distributed wood'||k.startsWith('checked tree')?k:`${k} ${counts[k]}/${needs[k]}`).join(', ')}`;
 return result;
}
module.exports={inspect,allocate};

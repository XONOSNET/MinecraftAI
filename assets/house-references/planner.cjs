// Offline reference import and conservative upgrade planning. No world mutations.
const AIR=new Set(['air','cave_air','void_air']);
const VOLATILE=new Set(['open','powered','occupied','lit','waterlogged']);
const key=p=>p.join(',');
function properties(p={}){return Object.fromEntries(Object.entries(p).filter(([k])=>!VOLATILE.has(k)).sort(([a],[b])=>a.localeCompare(b)));}
function family(name){return name?.endsWith('_planks')?'any_wood_planks':name?.endsWith('_bed')?'any_bed':name?.endsWith('_door')&&name!=='iron_door'?'any_wood_door':name?.endsWith('_trapdoor')&&name!=='iron_trapdoor'?'any_wood_trapdoor':name;}
function same(a,b){return !!a&&!!b&&family(a.name)===family(b.name)&&Object.entries(properties(a.properties)).every(([k,v])=>String(b.properties?.[k])===String(v));}
function item(block){
 if(block.name.endsWith('_door')&&block.properties.half==='upper'||block.name.endsWith('_bed')&&block.properties.part==='head')return null;
 return block.name==='wall_torch'?'torch':family(block.name);
}
function bill(blocks){const result={};for(const b of blocks){const n=item(b);if(n)result[n]=(result[n]||0)+1;}return Object.fromEntries(Object.entries(result).sort());}
function compile(scan,{replacements={ochre_froglight:'oak_planks'}}={}){
 const {bounds,floor_y:floor,top_y:top,blocks}=scan;
 if(!Array.isArray(bounds)||bounds.length!==4||!Number.isInteger(floor)||!Number.isInteger(top)||top<floor||top-floor>32)throw Error('Invalid reference scan bounds');
 const red=new Set(blocks.filter(b=>b.y===floor&&b.name==='redstone_block').map(b=>key([b.x,b.z]))),houses=[];
 while(red.size){
  const first=red.values().next().value,queue=[first],ring=new Set(queue);red.delete(first);
  for(const v of queue){const [x,z]=v.split(',').map(Number);for(const q of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){const k=key(q);if(red.delete(k)){ring.add(k);queue.push(k);}}}
  const points=[...ring].map(v=>v.split(',').map(Number)),x0=Math.min(...points.map(p=>p[0])),x1=Math.max(...points.map(p=>p[0])),z0=Math.min(...points.map(p=>p[1])),z1=Math.max(...points.map(p=>p[1]));
  const outside=new Set([key([x0-1,z0-1])]),flood=[[x0-1,z0-1]];
  for(const [x,z] of flood)for(const [a,c] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){const k=key([a,c]);if(a>=x0-1&&a<=x1+1&&c>=z0-1&&c<=z1+1&&!ring.has(k)&&!outside.has(k)){outside.add(k);flood.push([a,c]);}}
  const footprint=[];let interior=0;
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)if(!outside.has(key([x,z]))){footprint.push([x,z]);if(!ring.has(key([x,z])))interior++;}
  if(!interior)throw Error('Redstone outline is open or has no interior');
  const labels=blocks.filter(b=>b.name.endsWith('_sign')&&b.y===floor+1&&ring.has(key([b.x,b.z])));
  if(labels.length!==1||!/^\s*[1-4]\s*$/.test(labels[0].signText||''))throw Error('Each outline requires exactly one numbered sign (1-4)');
  const level=Number(labels[0].signText.trim()),mask=new Set(footprint.map(key));
  const selected=blocks.filter(b=>b.y>=floor&&b.y<=top&&mask.has(key([b.x,b.z]))&&b.name!=='redstone_block'&&!AIR.has(b.name)&&!labels.includes(b));
  const doors=selected.filter(b=>b.name.endsWith('_door')&&b.properties.half==='lower');
  if(doors.length!==1)throw Error('Reference needs one entrance for a stable upgrade anchor');
  const anchor=[doors[0].x,floor,doors[0].z];
  const entries=selected.map(b=>({position:[b.x-anchor[0],b.y-floor,b.z-anchor[2]],name:replacements[b.name]||b.name,properties:replacements[b.name]?{}:properties(b.properties)})).sort((a,b)=>a.position[1]-b.position[1]||a.position[2]-b.position[2]||a.position[0]-b.position[0]);
  houses.push({level,source_bounds:[x0,x1,z0,z1],source_anchor:anchor,footprint:footprint.map(([x,z])=>[x-anchor[0],z-anchor[2]]),height:top-floor+1,blocks:entries,materials:bill(entries)});
 }
 houses.sort((a,b)=>a.level-b.level);
 if(houses.length!==4||houses.some((h,i)=>h.level!==i+1))throw Error('Expected four distinct levels numbered 1 through 4');
 return {schema:1,unlock_night:4,anchor:'Entrance lower-door column at floor height; north-side entrance',material_policy:{wood:'Any wood species; reference names are preferences',beds:'Any bed color'},excluded:['redstone_block','numbered signs directly above redstone','air','container contents'],replacements,houses};
}
// Material-ready planning is separate from executing native placement. Existing
// inventory alone counts: planned demolitions never fabricate recovered items.
function planUpgrade(catalog,{nightLevel,currentLevel=0,goalComplete=false,anchor,inventory={},readBlock,protectedAt=()=>false}){
 if(nightLevel<catalog.unlock_night)return {state:'locked',reason:'House upgrades unlock in Night 4'};
 if(currentLevel>=4)return {state:'complete',level:4};
 if(!goalComplete)return {state:'waiting',reason:'Finish the current survival goal before upgrading'};
 if(!Array.isArray(anchor)||anchor.length!==3||!anchor.every(Number.isInteger)||typeof readBlock!=='function')throw Error('A checked world anchor and block reader are required');
 const next=catalog.houses.find(h=>h.level===currentLevel+1),old=catalog.houses.find(h=>h.level===currentLevel),world=b=>b.position.map((n,i)=>n+anchor[i]);
 const prior=new Map((old?.blocks||[]).map(b=>[key(world(b)),b])),desired=new Map(next.blocks.map(b=>[key(world(b)),b])),place=[],remove=[],blocked=[];
 // Reserve the full volume, including empty interior; never expand over a
 // neighboring plot or ignore a hidden block just because the design is air.
 for(const [dx,dz] of next.footprint)for(let dy=0;dy<next.height;dy++){
  const p=[anchor[0]+dx,anchor[1]+dy,anchor[2]+dz],k=key(p),actual=readBlock(p),previous=prior.get(k),target=desired.get(k);
  if(protectedAt(p)||!actual){blocked.push({position:p,reason:actual?'Protected neighboring/player area':'Unloaded terrain'});continue;}
  if(!AIR.has(actual.name)&&!same(target,actual)&&!same(previous,actual))blocked.push({position:p,reason:'Unowned or changed block',name:actual.name});
 }
 for(const b of old?.blocks||[]){const p=world(b),actual=readBlock(p),target=desired.get(key(p));if(!same(target,actual)&&same(b,actual))remove.push({...b,position:p,requiresEmptyContainer:['chest','furnace'].includes(b.name)});}
 for(const b of next.blocks){const p=world(b);if(!same(b,readBlock(p)))place.push({...b,position:p});}
 const available={};for(const [n,c] of Object.entries(inventory)){const k=family(n);available[k]=(available[k]||0)+c;}
 const needed=bill(place),missing=Object.fromEntries(Object.entries(needed).map(([n,c])=>[n,Math.max(0,c-(available[n]||0))]).filter(([,c])=>c));
 return {state:blocked.length?'blocked':Object.keys(missing).length?'gathering':'ready',from:currentLevel,to:next.level,needed,missing,blocked,remove,place,requiresShelterFallback:remove.length>0};
}
module.exports={compile,bill,item,same,family,planUpgrade};

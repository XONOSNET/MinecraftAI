// Real, bounded excavation: never dig under a player or erase a return stair.
const {Vec3}=require('vec3'),nav=require('./field_navigation'),space=require('./resource_space');
const access=require('./resource_access'),inventory=require('./inventory_sync'),{visibleBlock}=require('./target_scan');
const rules=require('../config/mining.json'),claims=new Map();
const EARTH=new Set(['dirt','grass_block','coarse_dirt','rooted_dirt','podzol','mycelium']);
const ROCK=new Set(['stone','granite','diorite','andesite','tuff','deepslate','coal_ore','deepslate_coal_ore','iron_ore','deepslate_iron_ore']);
const BAD=new Set(['sand','red_sand','gravel','water','lava','fire','soul_fire','magma_block','powder_snow']);
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const count=(b,name)=>b.inventory.items().filter(i=>i.name===name).reduce((s,i)=>s+i.count,0);
const point=q=>q.offset(.5,.1,.5).toArray();
function depth(resource,entryY,b){
 const min=(b.game?.minY??-64)+5;
 return resource==='iron'?Math.max(min,Math.min(entryY,rules.iron.preferred_y)):resource==='coal'?Math.max(min,rules.coal.minimum_y,entryY-8):Math.max(min,entryY-rules.stone.max_descent);
}
function allowed(t,b,q,w){
 const r=w.bounds;if(q.x<=r[0]+2||q.x>=r[1]-3||q.z<=r[2]+2||q.z>=r[3]-3)return false;
 if((t.campPlots||[]).concat(t.plot||[]).some(h=>Math.abs(q.x-h.x)<=5&&Math.abs(q.z-h.z)<=5))return false;
 for(const c of claims.values())if(c.run===t.run&&c.owner!==b.username&&c.path.some(p=>Math.hypot(q.x-p[0],q.z-p[2])<3&&Math.abs(q.y-p[1])<4))return false;
 return space.clearOfPlayers(b,q.offset(.5,.5,.5),2)&&!space.busy(b,t.run,q);
}
function dry(b,q){
 for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=-1;y<=3;y++){
  const v=b.blockAt(q.offset(x,y,z));if(!v||BAD.has(v.name)||v.name.endsWith('_concrete_powder')||v.getProperties?.().waterlogged)return false;
 }return true;
}
function step(t,b,from,dir,w){
 const q=from.offset(dir[0],-1,dir[1]);
 if(!allowed(t,b,q,w)||!dry(b,q))return null;
 const floor=b.blockAt(q.offset(0,-1,0));if(floor?.boundingBox!=='block'||!EARTH.has(floor.name)&&!ROCK.has(floor.name))return null;
 const cells=[q.offset(0,2,0),q.offset(0,1,0),q];
 if(cells.some(p=>(t.wilderness?.mine?.supports||t.wilderness?.mine?.path||[]).some(v=>v[0]===p.x&&v[2]===p.z&&v[1]-1===p.y)))return null;
 if(t.wilderness?.mine?.flooded?.includes(q.toString()))return null;
 if(cells.some(p=>{const v=b.blockAt(p);return !v||v.boundingBox!=='empty'&&!EARTH.has(v.name)&&!ROCK.has(v.name);}))return null;
 // A side-cell excavation may never intersect any player's supporting footprint.
 if([b.entity.position,...space.players(b)].some(p=>cells.some(v=>v.x<p.x+.31&&v.x+1>p.x-.31&&v.z<p.z+.31&&v.z+1>p.z-.31&&v.y<=p.y&&v.y+1>=p.y-.1)))return null;
 return {q,cells};
}
function start(t,b,state,resource){
 const base=b.entity.position.floored(),candidates=[];
 for(let dx=-8;dx<=8;dx+=2)for(let dz=-8;dz<=8;dz+=2)for(const dy of [0,1,-1]){
  const q=base.offset(dx,dy,dz);if(!allowed(t,b,q,state.world)||!nav.standable(b,q.x,q.y,q.z)||!dry(b,q))continue;
  if((t.wilderness.rejectedMines||[]).some(v=>Date.now()<v.until&&Math.hypot(q.x-v.x,q.z-v.z)<4))continue;
  for(let d=0;d<4;d++)if(step(t,b,q,DIRS[d],state.world))candidates.push({q,d,distance:q.distanceTo(base)});
 }
 for(const c of candidates.sort((a,b)=>a.distance-b.distance).slice(0,16))if(nav.route(b,point(c.q),20,2048,true,{bounds:state.world.bounds,reversible:true}).reached){
  const m={entry:c.q.toArray(),path:[c.q.toArray()],supports:[c.q.toArray()],flooded:[],dir:c.d,stage:'approach',resource,target_y:depth(resource,c.q.y,b),steps:0,lit_at:0,torches:0,coal_mined:0};
  claims.set(b.username,{run:t.run,owner:b.username,path:m.path});return m;
 }return null;
}
function report(t){const m=t.wilderness?.mine;return m?{stage:m.stage,resource:m.resource,target_y:m.target_y,depth:m.entry[1]-m.path.at(-1)[1],steps:m.steps,entry:m.entry,torches:m.torches,coal_mined:m.coal_mined,flooded_branches:m.flooded?.length||0,depth_knowledge:{coal_preferred_y:rules.coal.preferred_y,coal_minimum_y:rules.coal.minimum_y,iron_preferred_y:rules.iron.preferred_y},reason:m.reason||null}:null;}
async function light(t,b,motor,m){
 if(m.steps-m.lit_at<rules.torch_interval)return false;
 if(!count(b,'torch')){
  if(!count(b,'coal')&&!count(b,'charcoal'))return false;
  if(!count(b,'stick')){
   const planks=b.inventory.items().find(i=>i.name.endsWith('_planks')&&i.count>=2);
   if(!planks)return false;motor.pause();await t.craft(b,'stick',1,null);return true;
  }
  motor.pause();await t.craft(b,'torch',1,null);return true;
 }
 const q=b.entity.position.floored().offset(0,1,0);
 // Side walls survive excavation of the next stair; front-wall torches would
 // be knocked off as soon as mining continued.
 for(const [dx,dz] of [DIRS[(m.dir+1)%4],DIRS[(m.dir+3)%4]]){
  const support=b.blockAt(q.offset(dx,0,dz));if(support?.boundingBox!=='block'||b.blockAt(q)?.boundingBox!=='empty')continue;
  if(!space.clearOfPlayers(b,q.offset(.5,.5,.5),1))return true;
  motor.pause();await inventory.equip(b,'torch');await b.placeBlock(support,new Vec3(-dx,0,-dz));
  if(!['torch','wall_torch'].includes(b.blockAt(q)?.name))throw Error('Mine torch placement did not verify');
  m.lit_at=m.steps;m.torches++;t.lastProgress=Date.now();t.message='Lighting the mine staircase';return true;
 }return false;
}
async function tick(t,b,motor,state,api,scan,tasks,{resource='stone',amount=16}={}){
 const n=t.wilderness;let m=n.mine;
 if(!m){
  m=n.mine=start(t,b,state,resource);
  if(!m){t.message='Looking for a dry, supported staircase entrance outside house plots';return {handled:false};}
 }
 // Shelter/combat can interrupt any mining stage and bring the bot all the
 // way home. The protected house footprint is outside every allowed mine.
 // Retire that trip before inspecting stale underground hazards. The done
 // branch still checks real inventory before awarding any resource progress.
 const p=b.entity.position,h=t.plot;
 if(!['done','approach'].includes(m.stage)&&h&&b.entity.onGround===true&&
    Math.abs(Math.floor(p.x)-h.x)<=5&&Math.abs(Math.floor(p.z)-h.z)<=5&&Math.abs(p.y-h.y)<.5&&
    Math.hypot(p.x-m.entry[0]-.5,p.z-m.entry[2]-.5)>8&&nav.standable(b,Math.floor(p.x),Math.round(p.y),Math.floor(p.z))){
  m.stage='done';m.reason='Interrupted mining trip ended safely at home; rechecking collected supplies';claims.delete(b.username);
 }
 t.message='Staircase mine: '+m.stage+' · Y '+Math.floor(b.entity.position.y)+' → '+m.target_y+' · '+m.steps+' steps';
 if(m.stage==='done'){
  if(count(b,'cobblestone')>=amount)return {handled:true,done:true};
  n.rejectedMines=(n.rejectedMines||[]).filter(v=>Date.now()<v.until);
  n.rejectedMines.push({x:m.entry[0],z:m.entry[2],until:Date.now()+60000});
  n.lastMine=report(t);n.mine=null;return {handled:false,reason:m.reason};
 }
 const home=new Vec3(...m.entry);
 if(m.stage==='approach'){
  const arrived=await t.walk(b,motor,point(home),state,api,scan,tasks);
  if(arrived===true)m.stage='dig';
  else if(arrived===false){claims.delete(b.username);n.mine=null;return {handled:false};}
  return {handled:true};
 }
 if(m.stage==='exit'){
  // Survival interruptions can carry the bot home while this cursor still
  // points into the mine. Reconnect to the entrance through sensed terrain
  // rather than demanding that it revisit a now-obstructed lower landing.
  // A physics tick in mid-jump is not evidence that a return route failed.
  if(b.entity.onGround===false&&!b.entity.isInWater){motor.pause();t.message='Mine exit: waiting to land before checking the return route';return {handled:true};}
  const old=new Vec3(...m.path[m.exitIndex]);
  if(m.exitIndex>0&&(b.entity.position.distanceTo(old)>3||!nav.standable(b,old.x,old.y,old.z))){
   const radius=Math.min(192,Math.max(24,Math.ceil(b.entity.position.distanceTo(home))+8));
   if(nav.route(b,point(home),radius,8192,true,{bounds:state.world.bounds,reversible:true}).reached)m.exitIndex=0;
  }
  const q=new Vec3(...m.path[m.exitIndex]);
  if(!nav.standable(b,q.x,q.y,q.z))throw Error('Recorded mine return stair is obstructed or unsafe');
  const arrived=await t.walk(b,motor,point(q),state,api,scan,tasks);
  if(arrived===true){if(m.exitIndex===0){m.stage='done';claims.delete(b.username);}else m.exitIndex--;}
  else if(arrived===false){
   const nearby=space.players(b).some(p=>p.distanceTo(b.entity.position)<6);
   const terrainRoute=nearby&&nav.route(b,point(q),24,2048,false,{bounds:state.world.bounds,reversible:true}).reached;
   if(!space.clearOfPlayers(b,q.offset(.5,0,.5))||terrainRoute){motor.pause();t.message='Mine exit: waiting for another player to clear the return stair';return {handled:true};}
   throw Error('Unable to climb the recorded mine return staircase');
  }
  return {handled:true};
 }
 if(m.stage==='water_retreat'){
  const q=new Vec3(...m.path[m.waterIndex]);
  if(!dry(b,q)||!nav.standable(b,q.x,q.y,q.z))throw Error('Mine water cut off the verified dry retreat route');
  const arrived=await t.walk(b,motor,point(q),state,api,scan,tasks);
  if(arrived===true){m.path.splice(m.waterIndex+1);m.next=null;m.dir=(m.dir+1)%4;m.stage='dig';t.lastProgress=Date.now();}
  else if(arrived===false)throw Error('Mine water retreat could not reach dry ground');
  t.message='Water in mine: retreating to dry stairs before changing direction';return {handled:true};
 }
 if(m.stage==='descend'){
  const from=new Vec3(...m.path.at(-1)),next=m.next,q=from.offset(DIRS[next.d][0],-1,DIRS[next.d][1]);
  // Keep this committed landing across controller ticks. Re-centering on the
  // previous stair halfway through the move creates an endless out/back loop.
  if(!dry(b,q)){motor.pause();m.flooded.push(q.toString());m.next=null;m.stage='dig';return {handled:true};}
  if(!nav.standable(b,q.x,q.y,q.z))throw Error('New mine stair has no safe landing');
  const arrived=await t.walk(b,motor,point(q),state,api,scan,tasks);
  if(arrived===true){m.path.push(q.toArray());m.supports.push(q.toArray());m.steps++;m.dir=next.d;m.next=null;m.turned=false;m.stage='dig';t.lastProgress=Date.now();}
  else if(arrived===false)throw Error('New mine stair cannot be reached safely');
  return {handled:true};
 }
 const from=new Vec3(...m.path.at(-1));
 if(!dry(b,from)){
  motor.pause();m.flooded.push(from.toString());
  if(m.next)m.flooded.push(from.offset(...[DIRS[m.next.d][0],-1,DIRS[m.next.d][1]]).toString());
  m.waterIndex=m.path.findLastIndex(p=>{const q=new Vec3(...p);return dry(b,q)&&nav.standable(b,q.x,q.y,q.z);});
  if(m.waterIndex<0){
   // At an unexcavated entrance, adjacent sand or water can invalidate the
   // digging envelope while the occupied surface remains safe to walk away.
   if(m.steps===0&&m.path.length===1&&nav.standable(b,from.x,from.y,from.z)&&b.entity.position.distanceTo(from.offset(.5,0,.5))<.65){
    m.stage='done';m.reason='Entrance excavation envelope became unsafe; selecting another site';claims.delete(b.username);return {handled:true};
   }
   throw Error('Water or unsafe terrain entered the mine; no verified dry retreat remains');
  }
  m.stage='water_retreat';m.reason='Wet branch abandoned; seeking a dry mining direction';return {handled:true};
 }
 if(b.entity.position.distanceTo(from.offset(.5,0,.5))>.65){await t.walk(b,motor,point(from),state,api,scan,tasks);return {handled:true};}
 if(!b.entity.onGround){motor.pause();return {handled:true};}
 if(Math.hypot(b.entity.position.x-from.x-.5,b.entity.position.z-from.z-.5)>.18){await access.stabilize(b,motor,from);return {handled:true};}
 if(await light(t,b,motor,m))return {handled:true};
 // Only collect exposed side ores, never an ore beneath an occupied stair.
 for(const [dx,dz] of DIRS)for(const dy of [1,0]){
  const q=from.offset(dx,dy,dz),v=b.blockAt(q);
  if(!['coal_ore','deepslate_coal_ore'].includes(v?.name)||count(b,'coal')>=rules.coal_reserve||!allowed(t,b,q,state.world)||!dry(b,q)||!visibleBlock(b,v))continue;
  if(m.path.some(p=>p[0]===q.x&&p[2]===q.z&&q.y<p[1]))continue;
  const tool=b.inventory.items().find(i=>/^(netherite|diamond|iron|stone|wooden)_pickaxe$/.test(i.name))?.name;
  if(!tool)throw Error('A pickaxe is required before mining coal');
  await t.harvest(b,motor,q,state,api,scan,tasks,tool);
  if(b.blockAt(q)?.name==='air')m.coal_mined++;return {handled:true};
 }
 const enough=count(b,'cobblestone')>=amount;
 const unlit=m.steps-m.lit_at>=rules.unlit_steps;
 if(enough||unlit||m.steps>=rules.max_steps||from.y<=m.target_y){
  m.reason=enough?'Stone target collected':unlit?'Return for torch supplies before digging deeper':'Bounded mining depth reached';m.stage='exit';m.exitIndex=m.path.length-1;return {handled:true};
 }
 if(m.steps&&m.steps%rules.run_length===0&&!m.turned){m.dir=(m.dir+1)%4;m.turned=true;}
 const next=m.next||[0,1,3,2].map(d=>({d:(m.dir+d)%4})).map(v=>({...v,s:step(t,b,from,DIRS[v.d],state.world)})).find(v=>v.s);
 if(!next){m.stage='exit';m.exitIndex=m.path.length-1;m.reason='Hazard or unsupported terrain ahead; returning on intact stairs';return {handled:true};}
 m.next=next;
 const checked=step(t,b,from,DIRS[next.d],state.world);if(!checked){
  const q=from.offset(DIRS[next.d][0],-1,DIRS[next.d][1]);
  if(!dry(b,q)){m.flooded.push(q.toString());m.reason='Water or unsafe blocks ahead; changing mining direction';m.dir=(next.d+1)%4;}
  m.next=null;return {handled:true};
 }
 for(const q of checked.cells){
  const v=b.blockAt(q);if(v.boundingBox==='empty')continue;
  if(!b.canDigBlock(v))throw Error('Carried tools cannot mine the next staircase block');
  if(ROCK.has(v.name)){
   if(v.name.includes('iron_ore')&&!b.inventory.items().some(i=>/^(stone|iron|diamond|netherite)_pickaxe$/.test(i.name))){m.next=null;m.stage='exit';m.exitIndex=m.path.length-1;m.reason='Iron requires a stone pickaxe; preserving ore and returning';return {handled:true};}
   const tool=b.inventory.items().find(i=>/^(netherite|diamond|iron|stone)_pickaxe$/.test(i.name))?.name||'wooden_pickaxe';
   await t.harvest(b,motor,q,state,api,scan,tasks,tool);
  }else{
   motor.pause();motor.lockLook(true);try{if(await access.dig(b,v,{validate:()=>!!step(t,b,from,DIRS[next.d],state.world)})){t.harvested=(t.harvested||0)+1;t.lastProgress=Date.now();}}finally{motor.lockLook(false);}
  }
  return {handled:true};
 }
 if(!nav.standable(b,checked.q.x,checked.q.y,checked.q.z))throw Error('New mine stair has no safe landing');
 m.stage='descend';return {handled:true};
}
module.exports={depth,allowed,dry,step,start,report,light,tick,rules};

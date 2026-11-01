// A temporary, sealed refuge dug and exited with real survival actions.
const {Vec3}=require('vec3'),{standable,route}=require('./field_navigation'),space=require('./resource_space');
const inventory=require('./inventory_sync'),access=require('./resource_access'),combat=require('./combat');
const EARTH=new Set(['dirt','grass_block','coarse_dirt','rooted_dirt','podzol','mycelium']);
const SOLID=new Set([...EARTH,'stone','granite','diorite','andesite','deepslate','tuff','cobblestone']);
const DANGER=new Set(['water','lava','sand','red_sand','gravel','fire','soul_fire','magma_block']);
const MOBS=new Set(['skeleton','stray','bogged','zombie','husk','drowned','zombie_villager','creeper','witch','pillager','vindicator','spider','cave_spider','phantom','silverfish','endermite']);
const ARCHERS=new Set(['skeleton','stray','bogged','pillager']),claims=new Map();
function alive(b,e){const index=b.registry?.entitiesByName?.[e.name]?.metadataKeys?.indexOf('health'),health=typeof index==='number'&&index>=0?e.metadata?.[index]:undefined;return e.isValid!==false&&(typeof health!=='number'||health>0);}
function threats(b,standing=b.entity.position){
 const proxy=Object.create(b);proxy.entity={...b.entity,position:standing};
 return Object.values(b.entities||{}).filter(e=>alive(b,e)&&MOBS.has(e.name)&&e.position?.distanceTo(standing)<18&&combat.visible(proxy,e));
}
function walls(b,feet){
 // Two removed earth cells, an untouched floor, and a raised surface cap
 // supported by one protective dirt lip. Every surrounding cell stays solid.
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let y=feet.y-4;y<=feet.y-1;y++){
  if(dx===0&&dz===0&&y>feet.y-3)continue;
  const q=b.blockAt(new Vec3(feet.x+dx,y,feet.z+dz));if(!q||!SOLID.has(q.name)||q.boundingBox!=='block'||q.getProperties?.().waterlogged)return false;
 }
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=0;dy<=2;dy++){
  const q=b.blockAt(feet.offset(dx,dy,dz));if(!q||DANGER.has(q.name)||q.name.endsWith('_concrete_powder')||q.getProperties?.().waterlogged)return false;
 }
 return true;
}
function site(t,b,feet,w){
 const bounds=w.bounds;if(feet.x<=bounds[0]+2||feet.x>=bounds[1]-3||feet.z<=bounds[2]+2||feet.z>=bounds[3]-3)return false;
 if((t.campPlots||[t.plot]).filter(Boolean).some(h=>Math.abs(feet.x-h.x)<=5&&Math.abs(feet.z-h.z)<=5))return false;
 if(!standable(b,feet.x,feet.y,feet.z)||!space.clearOfPlayers(b,feet.offset(.5,0,.5),2.5))return false;
 for(let d=1;d<=2;d++)if(!EARTH.has(b.blockAt(feet.offset(0,-d,0))?.name))return false;
 if(![[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>b.blockAt(feet.offset(x,0,z))?.name==='air'))return false;
 return walls(b,feet);
}
function find(t,b,state){
 const p=b.entity.position,base=p.floored(),offsets=[],enemies=threats(b);
 for(let x=-12;x<=12;x+=2)for(let z=-12;z<=12;z+=2)offsets.push([x,z]);offsets.sort((a,c)=>Math.hypot(...a)-Math.hypot(...c));
 let checked=0;
 for(const [x,z] of offsets)for(const dy of [0,1,-1,2,-2]){
  const feet=base.offset(x,dy,z),goal=[feet.x+.5,feet.y+.1,feet.z+.5];
  if(Date.now()<(t.wilderness.burrowRejected?.get(feet.toString())||0))continue;
  if(enemies.some(e=>e.position.distanceTo(new Vec3(...goal))<12))continue;
  if(!site(t,b,feet,state.world))continue;
  if(space.busy(b,state.run,feet.offset(.5,0,.5)))continue;
  if([...claims.values()].some(c=>c.run===state.run&&c.owner!==b.username&&Math.hypot(c.x-feet.x,c.z-feet.z)<3))continue;
  if(route(b,goal,24,2048,true,{bounds:state.world.bounds,reversible:true}).reached)return feet;
  if(++checked>=6)return null;
 }return null;
}
function sealed(b,s){return s&&b.blockAt(new Vec3(...s.cap))?.name===s.cap_name;}
async function earthItem(b,s){
 const pick=()=>b.inventory.items().find(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name));
 let item=pick();if(item)return item;
 if(Date.now()-(s.inventoryAt||0)>=1000){s.inventoryAt=Date.now();await inventory.sync(b);item=pick();}
 return item;
}
function report(t){const s=t.wilderness?.burrow;return s?{stage:s.stage,surface:s.feet,reason:s.reason,sealed:!!s.cap_name}:null;}
async function tick(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness,w=state.world,now=Date.now();let s=n.burrow;
 if(!s){
  if(!w.first_night?.hostiles||b.isSleeping||b.health<=6)return false;
 const shelterPolicy=require('./shelter_policy'),enemies=threats(b),proactive=shelterPolicy.wantsCover(b,w),need=proactive||enemies.some(e=>ARCHERS.has(e.name)&&b.health<19||b.health<=16&&e.position.distanceTo(b.entity.position)<10);
  if(!need||t.milestones.includes('hut')&&(proactive||b.entity.position.distanceTo(new Vec3(t.plot.x+.5,t.plot.y,t.plot.z+.5))<12))return false;
  if(now<(n.burrowSearchAt||0))return false;n.burrowSearchAt=now+2500;
  const feet=find(t,b,state);if(!feet){n.burrow_status='No safe dry earth refuge found; refusing sand, water or unsupported ground';return false;}
  for(const [key,c] of claims)if(c.run!==state.run)claims.delete(key);
  claims.set(b.username,{run:state.run,owner:b.username,x:feet.x,z:feet.z});
  const offsets=[[1,0],[-1,0],[0,1],[0,-1]].filter(([x,z])=>b.blockAt(feet.offset(x,0,z))?.name==='air');
  if(enemies.length)offsets.sort((a,c)=>feet.offset(a[0]+.5,0,a[1]+.5).distanceTo(enemies[0].position)-feet.offset(c[0]+.5,0,c[1]+.5).distanceTo(enemies[0].position));
  s=n.burrow={feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(offsets[0][0],0,offsets[0][1]).toArray(),stage:'approach',resume:n.coverResume||t.phase,at:now,progressAt:now,reason:enemies.length?'Taking cover from '+enemies[0].name:'Taking cover before night-time work without protective equipment'};
  delete n.coverResume;
  t.phase='night_burrow';t.path=[];t.navigator.lastPlan=-Infinity;
 }
 const feet=new Vec3(...s.feet),cap=new Vec3(...s.cap),p=b.entity.position;
 n.priority='Emergency shelter';n.reason=s.reason;
 if(s.stage!=='hidden'&&now-s.progressAt>30000)throw Error('Emergency burrow work made no physical progress for 30 seconds');
 if(s.stage==='approach'){
  if(await t.walk(b,motor,[feet.x+.5,feet.y+.1,feet.z+.5],state,api,scan,tasks)===false){
   n.burrowRejected??=new Map();n.burrowRejected.set(feet.toString(),now+30000);
   n.burrow=null;claims.delete(b.username);t.phase=s.resume;n.burrowSearchAt=0;t.path=[];t.navigator.lastPlan=-Infinity;
   t.message='Blocked refuge route: seeking another safe earth patch';return true;
  }
  if(Math.hypot(p.x-feet.x-.5,p.z-feet.z-.5)<.45&&Math.abs(p.y-feet.y)<.2){
   if(threats(b).some(e=>e.position.distanceTo(p)<8)){n.burrow=null;claims.delete(b.username);t.phase=s.resume;n.burrowSearchAt=0;t.message='Threat too close to excavate: seeking a more distant earth refuge';return true;}
   if(!site(t,b,feet,w))throw Error('Emergency refuge terrain changed; refusing excavation');
   if(await access.stabilize(b,motor,feet)){s.stage='dig';s.progressAt=now;}
  }
  t.message='Emergency cover: reaching a verified dry earth patch';return true;
 }
 motor.pause();
 if(!walls(b,feet))throw Error('Emergency refuge walls or floor are no longer dry and supported');
 if(s.stage==='dig'){
  if(!b.entity.onGround){t.message='Emergency cover: settling after a one-block descent';return true;}
  const y=Math.round(p.y);if(y<=feet.y-2){s.stage='seal';s.progressAt=now;return true;}
  if(y<feet.y&&!s.lip_name){s.stage='lip';s.progressAt=now;return true;}
  if(Math.abs(p.x-feet.x-.5)>.2001||Math.abs(p.z-feet.z-.5)>.2001)throw Error('Emergency shaft footing changed');
  const q=new Vec3(feet.x,y-1,feet.z),block=b.blockAt(q);
  if(space.players(b).some(v=>Math.abs(v.y-q.y-1)<.25&&Math.abs(v.x-q.x-.5)<.8&&Math.abs(v.z-q.z-.5)<.8)){t.message='Emergency cover: waiting for another player to clear the shaft';return true;}
  if(!EARTH.has(block?.name)||!b.canDigBlock(block))throw Error('Emergency shaft is not safely hand-diggable earth');
  await b.dig(block,true);
  if(b.blockAt(q)?.name!=='air')throw Error('Emergency excavation was not confirmed');
  t.lastProgress=s.progressAt=Date.now();t.message='Emergency cover: digging one checked earth block';return true;
 }
 if(s.stage==='lip'){
  const item=await earthItem(b,s);
  if(!item){t.message='Emergency cover: collecting the first dirt block';return true;}
  const lip=new Vec3(...s.lip);if(b.blockAt(lip)?.name!=='air')throw Error('Emergency cover lip is obstructed');
  if(!space.clearOfPlayers(b,lip.offset(.5,.5,.5),1)){t.message='Emergency cover: waiting for a clear cover-block position';return true;}
  await inventory.equip(b,item.name,{synced:true});await b.lookAt(lip.offset(.5,0,.5),true);
  await b._placeBlockWithOptions(b.blockAt(lip.offset(0,-1,0)),new Vec3(0,1,0),{forceLook:'ignore',swingArm:'right'});
  if(b.blockAt(lip)?.name!==item.name)throw Error('Emergency cover lip was not confirmed');
  s.lip_name=item.name;s.stage='dig';t.lastProgress=s.progressAt=Date.now();t.message='Emergency cover: first dirt block shields the opening';return true;
 }
 if(s.stage==='seal'){
  if(Object.values(b.entities||{}).some(e=>alive(b,e)&&MOBS.has(e.name)&&e.position&&e.position.y<cap.y&&Math.hypot(e.position.x-feet.x-.5,e.position.z-feet.z-.5)<.8))throw Error('A hostile entered the emergency shaft; it is not a safe shelter');
  const item=await earthItem(b,s);
  if(!item){t.message='Emergency cover: collecting excavated dirt for the roof';return true;}
  if(p.y+1.8>cap.y||!b.entity.onGround)throw Error('Insufficient headroom for the emergency roof');
  if(!space.clearOfPlayers(b,cap.offset(.5,.5,.5),1)){t.message='Emergency cover: waiting for another player to leave the opening';return true;}
  const lip=new Vec3(...s.lip),face=cap.minus(lip);if(b.blockAt(lip)?.name!==s.lip_name)throw Error('Emergency roof support changed');
  await inventory.equip(b,item.name,{synced:true});const support=b.blockAt(lip);
  await b.lookAt(lip.offset(.5+face.x*.5,.5,.5+face.z*.5),true);
  await b._placeBlockWithOptions(support,face,{forceLook:'ignore',swingArm:'right'});
  if(b.blockAt(cap)?.name!==item.name)throw Error('Emergency roof placement was not confirmed');
  s.cap_name=item.name;s.stage='hidden';t.lastProgress=s.progressAt=Date.now();t.message='Emergency burrow sealed: waiting for daylight and a clear exit';return true;
 }
 if(s.stage==='hidden'){
  if(!sealed(b,s))throw Error('Emergency shelter roof was breached');
  const time=b.time?.timeOfDay,day=Number.isFinite(time)&&time>=0&&time<12000;
  const nearby=threats(b,feet.offset(.5,0,.5));
  t.message=day?'Emergency burrow: checking for threats above before leaving':'Emergency burrow: safely waiting for daylight';
  if(day&&!nearby.some(e=>ARCHERS.has(e.name)||e.position.distanceTo(feet.offset(.5,0,.5))<12)){s.stage='open';s.progressAt=now;}
  return true;
 }
 if(s.stage==='open'){
  const block=b.blockAt(cap);if(block?.name!==s.cap_name)throw Error('Emergency roof changed before exit');
  await b.dig(block,true);if(b.blockAt(cap)?.name!=='air')throw Error('Emergency roof did not open');
  s.stage='reclaim';t.lastProgress=s.progressAt=Date.now();return true;
 }
 if(s.stage==='reclaim'){
  const lip=b.blockAt(new Vec3(...s.lip));if(lip?.name!==s.lip_name)throw Error('Emergency cover lip changed before retrieval');
  await b.dig(lip,true);if(b.blockAt(lip.position)?.name!=='air')throw Error('Emergency cover lip did not clear');
  s.stage='climb';t.lastProgress=s.progressAt=Date.now();return true;
 }
 if(s.stage==='climb'){
  if(!b.entity.onGround)return true;
  if(p.y>=feet.y-.1){t.phase=s.resume;n.burrow=null;claims.delete(b.username);t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();t.message='Left the temporary burrow; resuming survival work';return true;}
  if(!sealed(b,{...s,cap_name:'air'}))throw Error('Emergency exit is blocked overhead');
  await inventory.sync(b);const item=b.inventory.items().find(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name));
  if(!item){t.message='Emergency exit: collecting the removed roof block';return true;}
  const q=new Vec3(feet.x,Math.round(p.y),feet.z),lease={until:Date.now()+10000,cancelled:false};b.labResourceAccess=lease;motor.lockLook(true);
  try{if(await access.jumpPlace(b,q,item))t.lastProgress=s.progressAt=Date.now();}
  finally{if(b.labResourceAccess===lease)delete b.labResourceAccess;motor.lockLook(false);b.clearControlStates();}
  t.message='Emergency exit: building a real dirt step back to the surface';return true;
 }
 return true;
}
async function seek(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness,p=b.entity.position,enemies=require('./shelter_policy').threats(b),now=Date.now();
 if(now>=(n.coverEscapeAt||0)){
  n.coverEscapeAt=now+2500;n.coverEscape=null;
  const choices=[];
  for(let x=-8;x<=8;x+=4)for(let z=-8;z<=8;z+=4)for(const dy of [0,1,-1]){
   const q=p.floored().offset(x,dy,z),g=[q.x+.5,q.y+.1,q.z+.5];
   if(!enemies.length||!standable(b,q.x,q.y,q.z))continue;
   const clearance=Math.min(...enemies.map(e=>e.position.distanceTo(new Vec3(...g))));
   if(clearance<=Math.min(...enemies.map(e=>e.position.distanceTo(p)))+2)continue;
   choices.push({g,clearance});
  }
  for(const c of choices.sort((a,b)=>b.clearance-a.clearance).slice(0,6))if(route(b,c.g,24,2048,true,{bounds:state.world.bounds,reversible:true}).reached){n.coverEscape=c.g;break;}
 }
 if(n.coverEscape)await t.walk(b,motor,n.coverEscape,state,api,scan,tasks);else motor.pause();
 t.message='Seeking safe earth cover; refusing exposed work or combat'+(n.burrow_status?' · '+n.burrow_status:'');
}
module.exports={EARTH,walls,site,find,sealed,report,tick,seek};

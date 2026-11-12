// A temporary, sealed refuge dug and exited with real survival actions.
const {Vec3}=require('vec3'),{standable,route,travelRoute}=require('./field_navigation'),space=require('./resource_space');
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
function shellProblem(b,feet,s){
 // Two removed earth cells, an untouched floor, and a raised surface cap
 // supported by one protective dirt lip. Every surrounding cell stays solid.
 const offsets=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)offsets.push([dx,dz]);
 // Check the actual enclosure before corners behind it. An exposed wall must
 // remain the repair target even when a diagonal void is also present.
 offsets.sort((a,c)=>Math.abs(a[0])+Math.abs(a[1])-Math.abs(c[0])-Math.abs(c[1]));
 for(const [dx,dz] of offsets)for(let y=feet.y-4;y<=feet.y-1;y++){
  if(dx===0&&dz===0&&y>feet.y-3)continue;
  const cell=new Vec3(feet.x+dx,y,feet.z+dz);
  if((s?.workspace||s?.furnacePocket)&&require('./burrow_workspace').opening(b,feet,s,cell))continue;
  if([s?.exitNotch,s?.repairNotch].filter(Boolean).some(p=>cell.equals(new Vec3(...p)))&&safeNotch(b,feet,cell)&&openCell(b.blockAt(cell)))continue;
  const q=b.blockAt(cell);
  // After excavation, an air-only corner behind two intact inward walls does
  // not open the shaft. Keep initial site selection strict and reject fluids,
  // unloaded cells and every missing cardinal wall or center floor as before.
  if(s?.shellVerified&&dx&&dz&&openCell(q)&&[new Vec3(feet.x+dx,y,feet.z),new Vec3(feet.x,y,feet.z+dz)].every(p=>{const v=b.blockAt(p);return v&&SOLID.has(v.name)&&v.boundingBox==='block'&&!v.getProperties?.().waterlogged;}))continue;
  if(!q||!SOLID.has(q.name)||q.boundingBox!=='block'||q.getProperties?.().waterlogged)return {position:cell.toArray(),block:q?.name||null,reason:!q?'unloaded shell':q.getProperties?.().waterlogged?'waterlogged shell':'changed supporting shell',patchable:openCell(q)};
 }
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=0;dy<=2;dy++){
  const cell=feet.offset(dx,dy,dz),q=b.blockAt(cell);if(!q||DANGER.has(q.name)||q.name.endsWith('_concrete_powder')||q.getProperties?.().waterlogged)return {position:cell.toArray(),block:q?.name||null,reason:!q?'unloaded surface':'fluid or falling-block hazard',patchable:false};
 }
 return null;
}
function walls(b,feet,s){return !shellProblem(b,feet,s);}
// One capped side pocket supplies a real extra exit block if the lip drop stayed above.
// Its ceiling, floor and exterior remain solid; never open a passage to surface or water.
function safeNotch(b,feet,q){
 if(q.y!==feet.y-2||Math.abs(q.x-feet.x)+Math.abs(q.z-feet.z)!==1)return false;
 const dx=q.x-feet.x,dz=q.z-feet.z;
 const closed=p=>{const v=b.blockAt(p);return !!v&&SOLID.has(v.name)&&v.boundingBox==='block'&&!v.getProperties?.().waterlogged;};
 return [q.offset(0,1,0),q.offset(0,-1,0),q.offset(dx,0,dz),q.offset(dz,0,dx),q.offset(-dz,0,-dx)].every(closed)&&space.clearOfPlayers(b,q.offset(.5,.5,.5),1);
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
 for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)offsets.push([x,z]);offsets.sort((a,c)=>Math.hypot(...a)-Math.hypot(...c));
 const fleeing=require('./shelter_policy').wantsCover(b,state.world,t);
 for(const urgent of [false,...(fleeing&&enemies.length?[true]:[])]){let checked=0;
 search:for(const [x,z] of offsets)for(const dy of [0,1,-1,2,-2]){
  const feet=base.offset(x,dy,z),goal=[feet.x+.5,feet.y+.1,feet.z+.5];
  if(Date.now()<(t.wilderness.burrowRejected?.get(feet.toString())||0))continue;
  if(enemies.some(e=>e.position.distanceTo(new Vec3(...goal))<(urgent?(e.name==='creeper'?4:1.5):12)))continue;
  if(!site(t,b,feet,state.world))continue;
  if(space.busy(b,state.run,feet.offset(.5,0,.5)))continue;
  if([...claims.values()].some(c=>c.run===state.run&&c.owner!==b.username&&Math.hypot(c.x-feet.x,c.z-feet.z)<3))continue;
  if(travelRoute(b,goal,24,2048,true,{bounds:state.world.bounds,reversible:true}).reached)return feet;
  if(++checked>=6)break search;
 }}return null;
}
function openingHostiles(b,target){return Object.values(b.entities||{}).filter(e=>e.isValid!==false&&MOBS.has(e.name)&&e.position&&Math.abs(e.position.x-target.x-.5)<.5+(e.width||.6)/2&&Math.abs(e.position.z-target.z-.5)<.5+(e.width||.6)/2&&e.position.y<target.y+1&&e.position.y+(e.height||1.8)>target.y);}
async function defendOpening(t,b,motor,s,target){
 const enemies=openingHostiles(b,target);if(!enemies.length)return false;
 motor.pause();t.message='Emergency cover: defending the opening from '+enemies[0].name+' before sealing';
 const enemy=enemies.find(e=>alive(b,e)&&e.position.distanceTo(b.entity.position)<=3&&combat.visible(b,e));if(!enemy||!b.attack)return true;
 const weapon=['netherite_sword','diamond_sword','iron_sword','netherite_axe','diamond_axe','iron_axe','stone_sword','stone_axe','wooden_sword','wooden_axe','golden_sword','golden_axe'].find(n=>b.inventory.items().some(i=>i.name===n));
 if(weapon&&b.heldItem?.name!==weapon)await inventory.equip(b,weapon);
 const now=Date.now();if(now-(s.lastOpeningAttack??-Infinity)<combat.attackDelay({weapon:b.heldItem?.name}))return true;
 motor.lockLook(true);try{
  await b.lookAt(enemy.position.offset(0,Math.min(.9,(enemy.height||1.8)/2),0),true);
  if(!alive(b,enemy)||enemy.position.distanceTo(b.entity.position)>3||!combat.visible(b,enemy))return true;
  b.attack(enemy);s.lastOpeningAttack=Date.now();t.lastProgress=s.progressAt=Date.now();
 }finally{motor.lockLook(false);}return true;
}
function cover(block,expected){return !!expected&&EARTH.has(expected)&&EARTH.has(block?.name)&&block.boundingBox==='block'&&!block.getProperties?.().waterlogged;}
function openCell(block){return !!block&&['air','cave_air','void_air','light'].includes(block.name)&&block.boundingBox==='empty';}
function sealed(b,s){const block=s&&b.blockAt(new Vec3(...s.cap));return !!s&&(s.cap_name==='air'?openCell(block):cover(block,s.cap_name));}
async function earthItem(b,s){
 const pick=()=>b.inventory.items().find(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name));
 let item=pick();if(item)return item;
 if(Date.now()-(s.inventoryAt||0)>=1000){s.inventoryAt=Date.now();await inventory.sync(b);item=pick();}
 return item;
}
async function placeCover(b,s,target,support,face,name){
 for(const height of [.2,.5,.8]){
  if(cover(b.blockAt(target),name))return true;
  if(!openCell(b.blockAt(target))||!space.clearOfPlayers(b,target.offset(.5,.5,.5),1))return false;
  if(!b.entity.onGround||b.entity.position.y+1.8>target.y&&face.y===0)return false;
  const actual=b.blockAt(support);if(!actual||actual.boundingBox!=='block'||actual.getProperties?.().waterlogged)throw Error('Emergency cover support is no longer solid and dry');
  await inventory.sync(b);await inventory.equip(b,name,{synced:true});
  const delta=new Vec3(.5+face.x*.5,face.y===0?height:face.y>0?1:0,.5+face.z*.5);
  await b.lookAt(support.plus(delta),true);
  try{await b._placeBlockWithOptions(actual,face,{forceLook:'ignore',swingArm:'right',delta});}
  catch(error){if(!String(error.message).includes('Server refused')&&!String(error.message).startsWith('Server did not answer the placement at'))throw error;s.coverRefusals=(s.coverRefusals||0)+1;}
  if(cover(b.blockAt(target),name))return true;
 }
 return false;
}
// Preserve the actual failure pose; the last travel report can predate digging.
function captureFailure(t,b,error){
 const s=t.wilderness?.burrow;if(!s)return;
 try{
  const p=b.entity.position,feet=p.floored(),sample=q=>{const v=b.blockAt(q);return {position:q.toArray(),block:v?.name||null,shape:v?.boundingBox||null,waterlogged:!!v?.getProperties?.().waterlogged};};
  s.failureContext={message:error.message,at:Date.now(),position:p.toArray(),velocity:b.entity.velocity?.toArray?.()||null,on_ground:b.entity.onGround===true,in_water:!!b.entity.isInWater,in_lava:!!b.entity.isInLava,
   centered:Math.abs(p.x-s.feet[0]-.5)<=.3&&Math.abs(p.z-s.feet[2]-.5)<=.3,
   body:sample(feet),head:sample(p.offset(0,b.entity.eyeHeight||1.62,0).floored()),floor:sample(feet.offset(0,-1,0)),
   cap:sample(new Vec3(...s.cap)),lip:sample(new Vec3(...s.lip)),
   earth_blocks:b.inventory.items().filter(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name)).reduce((n,i)=>n+i.count,0)};
 }catch(captureError){s.failureContext={message:error.message,capture_error:captureError.message};}
}
function report(t){const s=t.wilderness?.burrow;return s?{stage:s.stage,surface:s.feet,reason:s.reason,waiting_for:s.waitReason||null,exit_blocks:s.exitBlocks??null,cover_refusals:s.coverRefusals||0,failure_context:s.failureContext||null,shell_failure:s.shellFailure||null,shell_repairs:s.shellRepairs||0,workspace:s.workspace||null,shell_recovery:s.shellRecovery?.status||null,sealed:t.phase==='night_burrow'&&s.stage==='hidden'&&!!s.cap_name}:null;}
function retrySurface(t,b,s,reason){
 const feet=new Vec3(...s.feet),p=b.entity.position,q=p.floored();
 // Abandon excavation only while still on checked surface footing. A damaged
 // underground shell must never be silently treated as a safe refuge.
 if(Math.abs(p.y-feet.y)>.2||p.distanceTo(feet.offset(.5,0,.5))>2||!standable(b,q.x,q.y,q.z))return false;
 const n=t.wilderness;n.burrowRejected??=new Map();n.burrowRejected.set(feet.toString(),Date.now()+30000);
 n.burrow=null;claims.delete(b.username);t.phase=s.resume;n.burrowSearchAt=0;t.path=[];t.navigator.lastPlan=-Infinity;
 t.message=reason+'; seeking another checked earth refuge';return true;
}
async function tick(t,b,motor,state,api,scan,tasks){
 const n=t.wilderness,w=state.world,now=Date.now();let s=n.burrow;
 if(!s){
  if(!w.first_night?.hostiles||b.isSleeping||b.health<=0)return false;
  const risk=require('./shelter_policy').assess(b,w,t);
  if(risk.mode==='fight')return false;
 const enemies=threats(b),need=risk.mode==='cover'||enemies.some(e=>ARCHERS.has(e.name)&&b.health<19||b.health<=16&&e.position.distanceTo(b.entity.position)<10);
  if(!need||require('./refuge_choice').homeReachable(t,b,w))return false;
  if(now<(n.burrowSearchAt||0))return false;n.burrowSearchAt=now+2500;
  const feet=find(t,b,state);if(!feet){n.burrow_status='No safe dry earth refuge found; refusing sand, water or unsupported ground';return false;}
  for(const [key,c] of claims)if(c.run!==state.run)claims.delete(key);
  claims.set(b.username,{run:state.run,owner:b.username,x:feet.x,z:feet.z});
  const offsets=[[1,0],[-1,0],[0,1],[0,-1]].filter(([x,z])=>b.blockAt(feet.offset(x,0,z))?.name==='air');
  if(enemies.length)offsets.sort((a,c)=>feet.offset(a[0]+.5,0,a[1]+.5).distanceTo(enemies[0].position)-feet.offset(c[0]+.5,0,c[1]+.5).distanceTo(enemies[0].position));
  s=n.burrow={feet:feet.toArray(),cap:feet.toArray(),lip:feet.offset(offsets[0][0],0,offsets[0][1]).toArray(),stage:'approach',resume:n.coverResume||t.phase,at:now,progressAt:now,reason:enemies.length?'Taking cover from '+enemies[0].name:'Taking cover before night-time work without protective equipment'};
  delete n.coverResume;delete n.retreatCover;
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
   if(threats(b).some(e=>e.name==='creeper'&&e.position.distanceTo(p)<4||Math.hypot(e.position.x-feet.x-.5,e.position.z-feet.z-.5)<.65&&Math.abs(e.position.y-feet.y)<2)){n.burrow=null;claims.delete(b.username);t.phase=s.resume;n.burrowSearchAt=0;t.message='Threat occupies the excavation site: seeking another earth refuge';return true;}
   if(!site(t,b,feet,w)){if(retrySurface(t,b,s,'Refuge terrain changed before excavation'))return true;throw Error('Emergency refuge terrain changed; refusing excavation');}
   if(await access.stabilize(b,motor,feet)){s.shellVerified=true;s.stage='dig';s.progressAt=now;}
  }
  t.message='Emergency cover: reaching a verified dry earth patch';return true;
 }
 motor.pause();
 const problem=shellProblem(b,feet,s);
 if(problem){
  s.shellFailure={...problem,stage:s.stage};
  if(retrySurface(t,b,s,'Refuge shell changed before descent'))return true;
  if(await require('./burrow_repair').repair(t,b,motor,s,problem,state))return true;
  throw Error('Emergency refuge walls or floor are no longer dry and supported: '+JSON.stringify(problem));
 }
 if(s.shellRecovery&&(s.stage!=='hidden'||sealed(b,s)))s.shellRecovery.status='Shell restored and rechecked';
 if(s.stage==='dig'){
  if(!b.entity.onGround){t.message='Emergency cover: settling after a one-block descent';return true;}
  const y=Math.round(p.y);if(y<=feet.y-2){s.stage='seal';s.progressAt=now;return true;}
  if(y<feet.y&&!s.lip_name){s.stage='lip';s.progressAt=now;return true;}
  if(Math.abs(p.x-feet.x-.5)>.2001||Math.abs(p.z-feet.z-.5)>.2001){
   if(Math.floor(p.x)===feet.x&&Math.floor(p.z)===feet.z&&standable(b,feet.x,y,feet.z)){
    await access.stabilize(b,motor,new Vec3(feet.x,y,feet.z));t.message='Emergency cover: regaining centered footing before digging';return true;
   }
   if(retrySurface(t,b,s,'Moved away from the refuge shaft'))return true;
   throw Error('Emergency shaft footing changed');
  }
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
  if(await defendOpening(t,b,motor,s,lip))return true;
  if(!space.clearOfPlayers(b,lip.offset(.5,.5,.5),1)){t.message='Emergency cover: waiting for a clear cover-block position';return true;}
  if(!await placeCover(b,s,lip,lip.offset(0,-1,0),new Vec3(0,1,0),item.name)){t.message='Emergency cover lip refused: rechecking inventory and support';return true;}
  s.lip_name=item.name;s.stage='dig';t.lastProgress=s.progressAt=Date.now();t.message='Emergency cover: first dirt block shields the opening';return true;
 }
 if(s.stage==='seal'){
  if(await defendOpening(t,b,motor,s,cap)||await defendOpening(t,b,motor,s,cap.offset(0,-1,0)))return true;
  const item=await earthItem(b,s);
  if(!item){t.message='Emergency cover: collecting excavated dirt for the roof';return true;}
  if(p.y+1.8>cap.y||!b.entity.onGround)throw Error('Insufficient headroom for the emergency roof');
  if(!space.clearOfPlayers(b,cap.offset(.5,.5,.5),1)){t.message='Emergency cover: waiting for another player to leave the opening';return true;}
  const lip=new Vec3(...s.lip),face=cap.minus(lip);if(!cover(b.blockAt(lip),s.lip_name)){
   // Rebuild only our previously placed, now empty support. The ordinary lip
   // stage rechecks shell, footing, inventory, players and the placement result;
   // the existing work deadline is not reset merely by selecting recovery.
   if(s.shellVerified&&s.lip_name&&openCell(b.blockAt(lip))){s.stage='lip';t.message='Emergency roof support lost: rebuilding the owned dirt lip';return true;}
   throw Error('Emergency roof support changed: '+(b.blockAt(lip)?.name||'unloaded'));
  }
  if(!await placeCover(b,s,cap,lip,face,item.name)){t.message='Emergency roof refused: retrying checked cover face';return true;}
  s.cap_name=item.name;s.stage='hidden';t.lastProgress=s.progressAt=Date.now();t.message='Emergency burrow sealed: waiting for daylight and a clear exit';return true;
 }
 if(s.stage==='hidden'){
  if(!sealed(b,s)){
   const block=b.blockAt(cap),problem={position:cap.toArray(),block:block?.name||null,reason:'breached owned roof',patchable:openCell(block)};
   s.shellFailure={...problem,stage:s.stage};
   if(await require('./burrow_repair').repair(t,b,motor,s,problem,state))return true;
   throw Error('Emergency shelter roof was breached: '+JSON.stringify(problem));
  }
  const time=b.time?.timeOfDay,day=Number.isFinite(time)&&time>=0&&time<12000;
  const nearby=threats(b,feet.offset(.5,0,.5));
  const blocker=nearby.find(e=>ARCHERS.has(e.name)||e.position.distanceTo(feet.offset(.5,0,.5))<12);
  s.waitReason=!day?'daylight':blocker?blocker.name+' '+Math.round(blocker.position.distanceTo(feet.offset(.5,0,.5)))+'m above shelter':null;
  t.message='Emergency burrow: '+(s.waitReason?'waiting for '+s.waitReason:'clear daylight exit; preparing to leave');
  if(day&&!blocker){
   if(s.workspace&&await require('./burrow_workspace').returnToExit(t,b,motor,s,state,api,scan,tasks))return true;
   s.stage='open';s.progressAt=now;
  }
  else if(now>=(s.workspaceRetryAt||0)){
   try{if(await require('./burrow_workspace').tick(t,b,motor,s,state,api,scan,tasks))return true;}
   catch(error){s.workspaceRetryAt=now+30000;s.workspaceFailure=error.message;t.message='Protected work deferred: '+error.message;}
  }
  return true;
 }
 if(s.stage==='open'){
  const time=b.time?.timeOfDay,nearby=threats(b,feet.offset(.5,0,.5));
  if(!Number.isFinite(time)||time>=12000||nearby.some(e=>ARCHERS.has(e.name)||e.position.distanceTo(feet.offset(.5,0,.5))<12)){s.stage='hidden';t.message='Exit no longer clear: keeping the refuge sealed';return true;}
  const block=b.blockAt(cap);if(!cover(block,s.cap_name))throw Error('Emergency roof changed before exit');
  await b.dig(block,true);if(!openCell(b.blockAt(cap)))throw Error('Emergency roof did not open');
  s.stage='reclaim';t.lastProgress=s.progressAt=Date.now();return true;
 }
 if(s.stage==='reclaim'){
  const lip=b.blockAt(new Vec3(...s.lip));if(!cover(lip,s.lip_name))throw Error('Emergency cover lip changed before retrieval');
  await b.dig(lip,true);if(!openCell(b.blockAt(lip.position)))throw Error('Emergency cover lip did not clear');
  s.stage='climb';t.lastProgress=s.progressAt=Date.now();return true;
 }
 if(s.stage==='climb'){
  if(!b.entity.onGround)return true;
  if(p.y>=feet.y-.1){t.phase=s.resume;n.burrow=null;claims.delete(b.username);t.navigator.lastPlan=-Infinity;t.lastProgress=Date.now();t.message='Left the temporary burrow; resuming survival work';return true;}
  if(!sealed(b,{...s,cap_name:'air'}))throw Error('Emergency exit is blocked overhead');
  await inventory.sync(b);const items=b.inventory.items().filter(i=>['dirt','coarse_dirt','rooted_dirt'].includes(i.name));
  const count=items.reduce((sum,i)=>sum+i.count,0),remaining=Math.max(0,feet.y-Math.round(p.y));s.exitBlocks=count;
  // Recover enough blocks before rising beyond the safely capped side pocket.
  if(count<remaining&&Math.round(p.y)===feet.y-2){
   s.exitCollectAt??=now;
   if(now-s.exitCollectAt<1500){t.message='Emergency exit: collecting roof and lip drops';return true;}
   if(!s.exitNotch){
    const q=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>feet.offset(x,-2,z)).find(q=>safeNotch(b,feet,q)&&EARTH.has(b.blockAt(q)?.name)&&b.canDigBlock(b.blockAt(q)));
    if(q){await b.dig(b.blockAt(q),true);if(!openCell(b.blockAt(q)))throw Error('Emergency exit supply pocket did not clear');s.exitNotch=q.toArray();t.lastProgress=s.progressAt=Date.now();t.message='Emergency exit: recovering extra earth from a closed side pocket';return true;}
   }
   t.message='Emergency exit: collecting extra dirt before climbing ('+count+'/'+remaining+')';return true;
  }
  const item=items[0];
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
 const cell=q=>Math.floor(q[0]/8)+','+Math.floor(q[2]/8);n.coverVisited??=new Map();
 if(n.coverEscape){
  const distance=p.distanceTo(new Vec3(...n.coverEscape));
  if(distance<(n.coverEscapeBest??Infinity)-.5){n.coverEscapeBest=distance;n.coverEscapeProgressAt=now;}
  const caught=enemies.length&&(n.coverEscapeFallback?enemies.some(e=>e.position.distanceTo(new Vec3(...n.coverEscape))<(e.name==='creeper'?4:2)):Math.min(...enemies.map(e=>e.position.distanceTo(new Vec3(...n.coverEscape))))<Math.min(...enemies.map(e=>e.position.distanceTo(p)))-1);
  if(distance<.9||caught||now-(n.coverEscapeProgressAt||now)>8000){n.coverEscape=null;n.coverEscapeAt=0;}
 }
 if(!n.coverEscape&&now>=(n.coverEscapeAt||0)){
  n.coverEscapeAt=now+2500;
  n.coverSearches=(n.coverSearches||0)+1;
  const choices=[],wet=require('./water_navigation'),origin=p.floored();
  const inWater=!!b.entity.isInWater||wet.isWater(b.blockAt(origin))||wet.isWater(b.blockAt(origin.offset(0,-1,0)));
  const offsets=new Set();for(let x=-16;x<=16;x+=4)for(let z=-16;z<=16;z+=4)offsets.add(x+','+z);
  // Shore may be a one-cell strip between the old four-block samples.
  if(inWater)for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)offsets.add(x+','+z);
  for(const offset of offsets)for(const dy of [0,1,-1,2,-2,3,-3]){
   const [x,z]=offset.split(',').map(Number);
   const q=p.floored().offset(x,dy,z),g=[q.x+.5,q.y+.1,q.z+.5];
   const bounds=state.world.bounds;
   if(q.x<bounds[0]+6||q.x>bounds[1]-7||q.z<bounds[2]+6||q.z>bounds[3]-7)continue;
   if(Math.hypot(x,z)<(inWater?1:4)||!(standable(b,q.x,q.y,q.z)||wet.cell(b,q.x,q.y,q.z)?.wet===false))continue;
   const clearance=enemies.length?Math.min(...enemies.map(e=>e.position.distanceTo(new Vec3(...g)))):0;
   const safer=!enemies.length||clearance>Math.min(...enemies.map(e=>e.position.distanceTo(p)))+2;
   const soil=EARTH.has(b.blockAt(q.offset(0,-1,0))?.name)?4:0;
   choices.push({g,safer,score:clearance+soil+(inWater?-Math.hypot(x,z):Math.hypot(x,z)*.2)-(n.coverVisited.get(cell(g))||0)*6});
  }
  const foreign=q=>(t.campPlots||[]).some(h=>(h.x!==t.plot?.x||h.z!==t.plot?.z)&&require('./world_navigation').privatePlotCell(q,h));
  const sorted=choices.sort((a,b)=>b.score-a.score);
  for(const c of sorted.filter(c=>c.safer).slice(0,6)){
   n.coverRoutesChecked=(n.coverRoutesChecked||0)+1;
   const planned=travelRoute(b,c.g,32,4096,true,{bounds:state.world.bounds,reversible:true,forbidden:q=>
    foreign(q)||
    enemies.some(e=>e.position.distanceTo(new Vec3(q[0]+.5,q[1]+.1,q[2]+.5))<e.position.distanceTo(p)-.75)});
   if(!planned.reached||enemies.some(e=>planned.path.some(q=>e.position.distanceTo(new Vec3(...q))<e.position.distanceTo(p)-.75)))continue;
   n.coverEscape=c.g;n.coverEscapeFallback=false;n.coverEscapeBest=Infinity;n.coverEscapeProgressAt=now;n.coverVisited.set(cell(c.g),(n.coverVisited.get(cell(c.g))||0)+1);break;
  }
  // No route can promise increasing separation from every moving attacker.
  // Prefer a checked escape to standing exposed; still avoid close hostile cells.
  if(!n.coverEscape&&enemies.length)for(const c of sorted.slice(0,6)){
   n.coverRoutesChecked=(n.coverRoutesChecked||0)+1;
   const planned=travelRoute(b,c.g,32,4096,true,{bounds:state.world.bounds,reversible:true,forbidden:q=>foreign(q)||enemies.some(e=>{
    const radius=e.name==='creeper'?4:2,limit=Math.min(radius,Math.max(1,e.position.distanceTo(p)-.75));
    return e.position.distanceTo(new Vec3(q[0]+.5,q[1]+.1,q[2]+.5))<limit;
   })});
   if(!planned.reached)continue;
   n.coverEscape=c.g;n.coverEscapeFallback=true;n.coverEscapeBest=Infinity;n.coverEscapeProgressAt=now;n.coverVisited.set(cell(c.g),(n.coverVisited.get(cell(c.g))||0)+1);break;
  }
 }
 if(n.coverEscape){if(await t.walk(b,motor,n.coverEscape,state,api,scan,tasks)===false){n.coverEscape=null;n.coverEscapeAt=now+500;}}
 else if(b.entity.isInWater&&motor.command)motor.command(4,{kind:'expedition',water_route:true,waypoints:[[p.x,p.y,p.z]]},{},0);
 else motor.pause();
 t.message='Seeking safe earth cover; refusing exposed work or combat'+(n.burrow_status?' · '+n.burrow_status:'');
}
module.exports={captureFailure,EARTH,SOLID,DANGER,shellProblem,walls,site,find,sealed,report,tick,seek,cover,openCell,safeNotch,placeCover,defendOpening};

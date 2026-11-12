// A capped side passage shares the refuge's shell checks and never modifies its exit.
const {Vec3}=require('vec3'),space=require('./resource_space'),access=require('./resource_access');
const inventory=require('./inventory_sync'),work=require('./shelter_work'),{visibleBlock}=require('./target_scan');
const DIRECTIONS=[[1,0],[0,1],[-1,0],[0,-1]];
const OPEN=new Set(['air','cave_air','torch','wall_torch','light']);
const ROCK=/^(stone|granite|andesite|diorite|tuff|deepslate|(?:deepslate_)?(?:coal|iron)_ore)$/;
function safe(b,feet,room){
 const burrow=require('./emergency_burrow'),floor=new Vec3(...room.floor),dx=floor.x-feet.x,dz=floor.z-feet.z;
 if(floor.y!==feet.y-2||Math.abs(dx)+Math.abs(dz)!==1)return false;
 if(room.stationOnly)return burrow.safeNotch(b,feet,floor);
 const solid=p=>{const v=b.blockAt(p);return v?.boundingBox==='block'&&
  (burrow.SOLID.has(v.name)||ROCK.test(v.name))&&!v.getProperties?.().waterlogged;};
 const outside=[floor.offset(0,-1,0),floor.offset(0,2,0),...([0,1].flatMap(y=>[
  floor.offset(dz,y,-dx),floor.offset(-dz,y,dx)
 ]))];
 if(!room.stair)outside.push(floor.offset(dx,0,dz),floor.offset(dx,1,dz));
 else{
  const next=floor.offset(dx,-1,dz);
  outside.push(next.offset(0,-1,0),next.offset(0,3,0),...[0,1,2].flatMap(y=>[
   next.offset(dx,y,dz),next.offset(dz,y,-dx),next.offset(-dz,y,dx)
  ]));
 }
 return outside.every(solid)&&space.clearOfPlayers(b,floor.offset(.5,.5,.5),1);
}
function opening(b,feet,s,cell){
 for(const room of [s?.workspace,s?.furnacePocket]){
  if(!room)continue;
  const floor=new Vec3(...room.floor);
  if(!cell.equals(floor)&&(room.stationOnly||!cell.equals(floor.offset(0,1,0))))continue;
  const name=b.blockAt(cell)?.name;
  return safe(b,feet,room)&&(OPEN.has(name)||cell.equals(floor)&&!!room.station&&room.station===name);
 }
 return false;
}
const center=q=>q.offset(.5,.1,.5).toArray();
function atExit(b,s){
 const feet=new Vec3(...s.feet),p=b.entity.position;
 return Math.abs(p.y-(feet.y-2))<.2&&Math.hypot(p.x-feet.x-.5,p.z-feet.z-.5)<.35;
}
async function returnToExit(t,b,motor,s,state,api,scan,tasks){
 const feet=new Vec3(...s.feet);
 if(atExit(b,s))return false;
 await t.walk(b,motor,center(feet.offset(0,-2,0)),state,api,scan,tasks);
 t.message='Returning from protected work to the burrow exit';
 return true;
}
async function tick(t,b,motor,s,state,api,scan,tasks){
 if(!work.rules.enabled||!work.rules.burrow_workspace||!b.entity.onGround||!b.recipesFor)return false;
 const feet=new Vec3(...s.feet),p=b.entity.position;
 if(!atExit(b,s)&&!(s.workspace?.stair&&p.distanceTo(new Vec3(...s.workspace.floor).offset(.5,0,.5))<.55))return false;
 if(await work.tick(t,b,motor))return true;
 const items=b.inventory.items(),pick=require('./tool_recovery').choose(b,'wooden_pickaxe');
 if(!s.workspace&&!items.some(i=>i.name==='crafting_table'||i.name==='furnace')&&
    items.some(i=>i.name.endsWith('_planks')&&i.count>=4)&&await work.tick(t,b,motor,{prepare:'crafting_table'}))return true;
 if(!pick&&!items.some(i=>i.name==='torch'||i.name==='crafting_table'||i.name==='furnace'))return false;
 if(!s.workspace){
  const bounds=state.world.bounds,plotList=[t.plot,...(t.campPlots||[])].filter(Boolean);
  const candidates=DIRECTIONS.map(([x,z])=>feet.offset(x,-2,z)).filter(q=>q.x>bounds[0]+2&&q.x<bounds[1]-3&&q.z>bounds[2]+2&&q.z<bounds[3]-3&&
   !plotList.some(h=>Math.abs(q.x-h.x)<=5&&Math.abs(q.z-h.z)<=5));
  // The exit reclaims its own lip. It cannot serve as a permanent alcove roof.
  const full=candidates.find(q=>(q.x!==s.lip?.[0]||q.z!==s.lip?.[2])&&safe(b,feet,{floor:q.toArray()}));
  const floor=full||candidates.find(q=>safe(b,feet,{floor:q.toArray(),stationOnly:true}));
  if(!floor)return false;
  s.workspace={floor:floor.toArray(),attempts:0,stationOnly:!full};
 }
 const room=s.workspace,at=new Vec3(...room.floor);
 if(room.attempts>=4||!safe(b,feet,room))return false;
 const cells=room.stationOnly?[at]:[at.offset(0,1,0),at],direction=[at.x-feet.x,at.z-feet.z];
 const step=at.offset(direction[0],-1,direction[1]),stairs=[step.offset(0,2,0),step.offset(0,1,0),step];
 const workCells=room.stair?cells.concat(stairs):cells;
 const blocks=workCells.map(q=>b.blockAt(q));
 if(blocks.some(v=>!v))return false;
 const block=blocks.find(v=>!OPEN.has(v.name)&&v.name!==room.station);
 if(block){
  const burrow=require('./emergency_burrow');
  if(!block.name||(!burrow.SOLID.has(block.name)&&!ROCK.test(block.name)))return false;
  if(room.stair&&atExit(b,s)&&!visibleBlock(b,block)&&require('./field_navigation').standable(b,at.x,at.y,at.z)){
   const arrived=await t.walk(b,motor,center(at),state,api,scan,tasks);
   if(arrived===false)room.attempts++;
   t.message='Taking the checked alcove stance to reach the stair face';return true;
  }
  const aimPoint=block.position.offset(.5,.18,.5);
  if(!visibleBlock(b,block,aimPoint)||!b.canDigBlock(block))return false;
  const tool=ROCK.test(block.name)?require('./tool_recovery').choose(b,block.name.endsWith('iron_ore')?'stone_pickaxe':'wooden_pickaxe'):null;
  if(ROCK.test(block.name)&&!tool)return false;
  motor.pause();
  if(tool)await inventory.equip(b,tool);
  room.attempts++;
  if(await access.dig(b,block,{aimPoint,validate:()=>safe(b,feet,room)&&burrow.sealed(b,s)})){
   room.attempts=0;room.dug=(room.dug||0)+1;t.lastProgress=Date.now();t.message='Excavating a capped side passage while the refuge stays sealed';
   if(block.name.endsWith('_ore'))t.wilderness.memory?.remember(block.name.endsWith('iron_ore')?'iron':'coal',block.position,p);
  }
  return true;
 }
 const torch=cells.some(q=>['torch','wall_torch'].includes(b.blockAt(q)?.name));
 const torchCell=room.stationOnly?at:at.offset(0,1,0);
 if(!torch&&work.count(b,'torch')&&b.blockAt(torchCell)?.name==='air'&&
    !(room.stationOnly&&items.some(i=>['crafting_table','furnace'].includes(i.name)))){
  const wall=room.stationOnly?torchCell.offset(0,-1,0):torchCell.offset(direction[1],0,-direction[0]),target=torchCell;
  motor.pause();await inventory.equip(b,'torch');room.attempts++;
  try{await b.placeBlock(b.blockAt(wall),target.minus(wall));}catch{ /* Confirm the authoritative block below. */ }
  if(['torch','wall_torch'].includes(b.blockAt(target)?.name)){room.attempts=0;room.lit=true;t.lastProgress=Date.now();t.message='Lighting the sealed burrow workspace';}
  return true;
 }
 if(!room.stationOnly&&!room.stair&&!room.station&&pick&&!items.some(i=>['crafting_table','furnace'].includes(i.name))&&safe(b,feet,{...room,stair:true})&&
    stairs.every(q=>{const v=b.blockAt(q);return v?.boundingBox==='block'&&(ROCK.test(v.name)||require('./emergency_burrow').SOLID.has(v.name));})&&
    require('./staircase_mining').allowed(t,b,step,state.world)){
  room.stair=true;t.message='Checked a dry descending stair behind the sealed alcove';return true;
 }
 if(atExit(b,s)&&!room.station&&!room.stair&&b.blockAt(at)?.name==='air'){
  const name=['crafting_table','furnace'].find(n=>work.count(b,n));
  if(name){
   motor.pause();await inventory.equip(b,name);room.attempts++;
   try{await b.placeBlock(b.blockAt(at.offset(0,-1,0)),new Vec3(0,1,0));}catch{ /* Confirm before using the station. */ }
   if(b.blockAt(at)?.name===name){room.station=name;room.attempts=0;t.lastProgress=Date.now();t.message='Installing '+name+' in the sealed burrow';}
   return true;
  }
 }
 const station=b.blockAt(at);
 const table=station?.name==='crafting_table'?station:null;
 if(table&&atExit(b,s)&&work.count(b,'furnace')&&!s.furnacePocket?.station&&await furnacePocket(t,b,motor,s,feet,at,state))return true;
 const hearth=s.furnacePocket?.station?b.blockAt(new Vec3(...s.furnacePocket.floor)):station;
 return work.tick(t,b,motor,{table,hearth:hearth?.name==='furnace'?hearth:null,prepare:table&&!s.furnacePocket?.station?'furnace':null});
}
async function furnacePocket(t,b,motor,s,feet,table,state){
 const burrow=require('./emergency_burrow'),candidate=feet.offset(feet.x-table.x,-2,feet.z-table.z);
 if(!require('./staircase_mining').allowed(t,b,candidate,state.world)||!burrow.safeNotch(b,feet,candidate))return false;
 const room=s.furnacePocket??={floor:candidate.toArray(),stationOnly:true,attempts:0};
 if(room.attempts>=4)return false;
 const block=b.blockAt(candidate);
 motor.pause();
 if(block?.name==='air'){
  await inventory.equip(b,'furnace');room.attempts++;
  try{await b.placeBlock(b.blockAt(candidate.offset(0,-1,0)),new Vec3(0,1,0));}catch{ /* Confirm the station below. */ }
  if(b.blockAt(candidate)?.name==='furnace'){room.station='furnace';t.lastProgress=Date.now();t.message='Installed a furnace in the sealed burrow';}
  return true;
 }
 if(!block||!burrow.EARTH.has(block.name)&&(!ROCK.test(block.name)||!require('./tool_recovery').choose(b,block.name.endsWith('iron_ore')?'stone_pickaxe':'wooden_pickaxe')))return false;
 const aimPoint=block.position.offset(.5,.18,.5);
 if(!visibleBlock(b,block,aimPoint)||!b.canDigBlock(block))return false;
 room.attempts++;
 if(await access.dig(b,block,{aimPoint,validate:()=>safe(b,feet,room)&&burrow.sealed(b,s)})){
  room.attempts=0;t.lastProgress=Date.now();t.message='Clearing a capped furnace recess in the burrow';
 }
 return true;
}
module.exports={opening,safe,tick,returnToExit};

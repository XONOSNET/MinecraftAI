// Bounded physical access skills, shared by teacher and policy world runs.
const {Vec3}=require('vec3'),{withinReach}=require('./resource_target'),{visibleBlock}=require('./target_scan');
const space=require('./resource_space'),inventory=require('./inventory_sync'),{aim}=require('./harvest');
const MAX_HEIGHT=3,MAX_CLEAR=6;
const material=n=>n.endsWith('_planks')||['dirt','cobblestone','coarse_dirt','andesite','granite','diorite'].includes(n);
const clearable=b=>!!b&&(b.name.endsWith('_leaves')||['dirt','grass_block','coarse_dirt','rooted_dirt','short_grass','tall_grass','vine'].includes(b.name));
function inside(p,b){return !b||p.x>b[0]+1&&p.x<b[1]-2&&p.z>b[2]+1&&p.z<b[3]-2;}
function protectedAt(p,plots){return plots.filter(Boolean).some(q=>Math.abs(p.x-q.x)<=4&&Math.abs(p.z-q.z)<=4&&p.y>=q.y-1&&p.y<=q.y+5);}
function dry(bot,p){for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const b=bot.blockAt(p.offset(dx,dy,dz));if(!b||['water','lava','fire','soul_fire','sand','gravel','magma_block'].includes(b.name))return false;}return true;}
// Test a loaded sight corridor. Hard blocks stop the search; never tunnel blindly.
function corridor(bot,target,standing=bot.entity.position){
 const eye=standing.offset(0,bot.entity.eyeHeight||1.62,0),delta=target.offset(.5,.5,.5).minus(eye),length=delta.norm();
 if(length>8)return {clear:false,block:null};
 const seen=new Set();let first=null,count=0;
 for(let d=0;d<=length;d+=.1){const p=eye.plus(delta.scaled(d/length)).floored(),key=p.toString();if(seen.has(key))continue;seen.add(key);
  if(p.equals(target))return {clear:true,block:first};
  const b=bot.blockAt(p);if(!b)return {clear:false,block:null};
  if(b.boundingBox==='empty'&&!clearable(b))continue;
  if(!clearable(b)||++count>3)return {clear:false,block:null};
  first=first||b;
 }
 return {clear:false,block:null};
}
function obstruction(bot,target){return corridor(bot,target).block;}
function safeClear(bot,block,{bounds,plots=[]}={}){
 if(!clearable(block)||!inside(block.position,bounds)||protectedAt(block.position,plots)||!dry(bot,block.position))return false;
 const p=bot.entity.position,q=block.position;
 if(!bot.entity.onGround||q.y<Math.floor(p.y)-1)return false;
 // Never remove a block intersecting anybody's supporting footprint.
 for(const who of [p,...space.players(bot)])if(Math.abs(q.y+1-who.y)<.2&&q.x<who.x+.31&&q.x+1>who.x-.31&&q.z<who.z+.31&&q.z+1>who.z-.31)return false;
 return space.clearOfPlayers(bot,q.offset(.5,.5,.5));
}
function canClear(bot,target,options={}){const b=obstruction(bot,target);return !!b&&withinReach(bot,b.position)&&safeClear(bot,b,options);}
function canRaise(bot,target,{bounds,plots=[]}={}){
 const p=bot.entity.position,feet=p.floored(),base=feet.offset(0,-1,0),support=bot.blockAt(base);
 if(!bot.entity.onGround||Math.hypot(target.x+.5-p.x,target.z+.5-p.z)>2.5||target.y-p.y<3||target.y-p.y>7)return false;
 if(!inside(feet,bounds)||protectedAt(feet,plots)||!space.clearOfPlayers(bot,p)||!support||support.boundingBox!=='block'||!dry(bot,base))return false;
 return [0,1,2,3].every(y=>{const b=bot.blockAt(feet.offset(0,y,0));return b?.name==='air'&&dry(bot,feet.offset(0,y,0));});
}
async function dig(bot,block,{validate=null}={}){
 if(!block||!withinReach(bot,block.position)||!visibleBlock(bot,block)||!bot.canDigBlock(block))return false;
 const type=block.name.endsWith('_planks')?'axe':['dirt','grass_block','coarse_dirt','rooted_dirt'].includes(block.name)?'shovel':material(block.name)?'pickaxe':null;
 const tool=type&&['netherite','diamond','iron','stone','wooden','golden'].map(t=>t+'_'+type).find(n=>bot.inventory.items().some(i=>i.name===n));
 if(tool)await inventory.equip(bot,tool);
 await aim(bot,block.position.offset(.5,.5,.5));
 const current=bot.blockAt(block.position);
 if(current?.name!==block.name||!withinReach(bot,block.position)||!visibleBlock(bot,current)||!bot.canDigBlock(current)||validate&&!validate(current))return false;
 await bot.dig(current,true);
 return bot.blockAt(block.position)?.name==='air';
}
async function controlled(bot,motor,action){
 motor.pause();motor.lockLook(true);const lease={until:Date.now()+30000,cancelled:false};bot.labResourceAccess=lease;
 try{return await action();}finally{if(bot.labResourceAccess===lease)delete bot.labResourceAccess;bot.clearControlStates();motor.lockLook(false);}
}
function active(bot){if(bot.labResourceAccess&&(bot.labResourceAccess.cancelled||Date.now()>bot.labResourceAccess.until))throw Error('Resource access movement was interrupted');}
async function center(bot,feet){
 const goal=feet.offset(.5,0,.5);
 await aim(bot,goal.offset(0,bot.entity.eyeHeight||1.62,0));
 try{for(let i=0;i<18;i++){
  active(bot);if(Math.hypot(bot.entity.position.x-goal.x,bot.entity.position.z-goal.z)<.09)break;
  if(!bot.entity.onGround||!bot.entity.position.floored().equals(feet))throw Error('Resource stance changed during centering');
  await bot.look(Math.atan2(goal.x-bot.entity.position.x,goal.z-bot.entity.position.z)+Math.PI,0,true);
  bot.setControlState('sneak',true);bot.setControlState('forward',true);await bot.waitForTicks(1);
 }}finally{bot.clearControlStates();}
 await bot.waitForTicks(3);
 return Math.hypot(bot.entity.position.x-goal.x,bot.entity.position.z-goal.z)<=.15;
}
async function stabilize(bot,motor,feet){
 return controlled(bot,motor,async()=>{
  // Released controls retain velocity for several physics ticks.
  await bot.waitForTicks(4);active(bot);
  if(!bot.entity.onGround||!bot.entity.position.floored().equals(feet))return false;
  if(Math.hypot(bot.entity.position.x-feet.x-.5,bot.entity.position.z-feet.z-.5)>.06)return center(bot,feet);
  return true;
 });
}
async function recoverColumn(bot,motor,state){
 const entry=state.column?.at(-1),p=bot.entity.position;if(!entry)return false;
 const feet=entry.position.offset(0,1,0),support=bot.blockAt(entry.position);
 // Recovery is local to the exact tracked support, never a jump across a gap.
 if(!bot.entity.onGround||Math.abs(p.y-feet.y)>.15||!p.floored().equals(feet)||support?.name!==entry.name)return false;
 return stabilize(bot,motor,feet);
}
async function jumpPlace(bot,position,item){
 await inventory.equip(bot,item.name);const support=bot.blockAt(position.offset(0,-1,0));
 if(support?.boundingBox!=='block'||bot.blockAt(position)?.name!=='air')return false;
 await aim(bot,position.offset(.5,0,.5));
 bot.setControlState('jump',true);
 try{
  // Wait for a real physics tick above the placement cell, not a timed teleport.
  for(let i=0;i<14;i++){
   await bot.waitForTicks(1);active(bot);
   if(bot.entity.position.y>=position.y+1.02){
    try{await bot.placeBlock(support,new Vec3(0,1,0));}
    catch(error){if(!String(error.message).includes('Server refused to place'))throw error;}
    break;
   }
  }
 }finally{bot.setControlState('jump',false);}
 for(let i=0;i<25;i++){if(bot.entity.onGround&&bot.entity.position.y>=position.y+.95)break;await bot.waitForTicks(1);}
 return bot.blockAt(position)?.name===item.name;
}
async function attempt(bot,motor,target,options={}){
 const state=options.state,p=bot.entity.position,plots=options.plots||[];motor.pause();
 if(space.busy(bot,options.run,target))return {handled:false,message:'Another miner is using this resource'};
 const block=obstruction(bot,target),key=target.toString();
 if(state.clearingTarget!==key){state.clearingTarget=key;state.cleared=0;}
 if(block&&withinReach(bot,block.position)&&safeClear(bot,block,options)&&(state.cleared||0)<MAX_CLEAR){
  motor.lockLook(true);try{if(await dig(bot,block)){state.cleared=(state.cleared||0)+1;return {handled:true,progress:true,message:'Clearing '+block.name+' to expose '+(bot.blockAt(target)?.name||'the selected resource')};}}finally{motor.lockLook(false);}
 }
 // Build-up and its tracked descent belong to tree harvesting only.
 if(!bot.blockAt(target)?.name.endsWith('_log'))return {handled:false,message:'No safe removable cover in reach'};
 if((state.column?.length||0)>=MAX_HEIGHT||!canRaise(bot,target,options))return {handled:false,message:'No safe clearing or build-up approach'};
 const item=bot.inventory.items().filter(i=>material(i.name)&&i.count>0).sort((a,b)=>Number(a.name.endsWith('_planks'))-Number(b.name.endsWith('_planks')))[0];
 if(!item)return {handled:false,message:'Higher logs need carried dirt, stone or planks for a temporary column'};
 const feet=p.floored();if(!await stabilize(bot,motor,feet))return {handled:true,message:'Waiting for settled footing before building up'};
 if(!canRaise(bot,target,options))return {handled:false,message:'Resource footing changed before the jump'};
 state.column=state.column||[];state.baseY=state.baseY??feet.y;state.tree=[target.x,target.z];
 return controlled(bot,motor,async()=>{
  const placed=await jumpPlace(bot,feet,item);state.placeFailures=placed?0:(state.placeFailures||0)+1;
  // Track server-confirmed blocks even if landing has not settled yet.
  if(bot.blockAt(feet)?.name===item.name)state.column.push({position:feet.clone(),name:item.name});
  return {handled:placed||state.placeFailures<2,progress:placed,message:placed?'Built temporary step '+state.column.length+' / '+MAX_HEIGHT+' to reach higher logs':state.placeFailures<2?'Server rejected the temporary block; checking grounded footing before one retry':'Temporary placement rejected twice; choosing another safe approach'};
 });
}
async function descend(bot,motor,state){
 motor.pause();const entry=state.column?.at(-1);if(!entry)return true;
 const p=bot.entity.position,q=entry.position;
 // Never mine a natural support, another bot's block, or a column left behind.
 if(Math.hypot(p.x-q.x-.5,p.z-q.z-.5)>.2||Math.abs(p.y-q.y-1)>.15||!bot.entity.onGround)throw Error('Temporary column descent needs a centered, settled stance');
 const b=bot.blockAt(q),floor=bot.blockAt(q.offset(0,-1,0));
 if(b?.name!==entry.name||floor?.boundingBox!=='block'||!dry(bot,q))throw Error('Temporary column changed; cannot descend safely');
 motor.lockLook(true);let removed;try{removed=await dig(bot,b);}finally{motor.lockLook(false);}
 if(!removed){
  // Keep the exact tracked support and retry after the next settled ticks.
  // A transient visibility/equipment check must not strand an otherwise safe
  // harvesting run after a single refusal. Never pop an unremoved block.
  await bot.waitForTicks(2);
  if((state.descentFailures=(state.descentFailures||0)+1)<3)return false;
  throw Error('Temporary support removal failed three times: '+JSON.stringify({support:[q.x,q.y,q.z],name:bot.blockAt(q)?.name,visible:visibleBlock(bot,b),reachable:withinReach(bot,q),can_dig:bot.canDigBlock(b)}));
 }
 state.descentFailures=0;state.column.pop();await bot.waitForTicks(2);for(let i=0;i<25&&!bot.entity.onGround;i++)await bot.waitForTicks(1);
 return state.column.length===0;
}
module.exports={MAX_HEIGHT,material,clearable,corridor,obstruction,safeClear,canClear,canRaise,dig,jumpPlace,center,stabilize,recoverColumn,attempt,descend};

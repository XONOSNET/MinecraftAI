// Clear only natural obstructions in the bot's own building/work volume.
const {Vec3}=require('vec3'),house=require('./house'),space=require('./resource_space');
const access=require('./resource_access'),inventory=require('./inventory_sync');
const SOFT=new Set(['short_grass','tall_grass','fern','large_fern','dead_bush','vine','glow_lichen','moss_carpet','snow','poppy','dandelion','blue_orchid','allium','azure_bluet','oxeye_daisy','cornflower','lily_of_the_valley','wither_rose','sunflower','lilac','rose_bush','peony','pink_petals','wildflowers','leaf_litter','brown_mushroom','red_mushroom']);
const EARTH=new Set(['dirt','grass_block','coarse_dirt','rooted_dirt','podzol','mycelium','moss_block','stone','granite','diorite','andesite','deepslate','tuff']);
const natural=name=>SOFT.has(name)||EARTH.has(name)||name.endsWith('_leaves')||name.endsWith('_log')||name.endsWith('_tulip');
const empty=b=>b&&['air','cave_air','void_air'].includes(b.name);
function owned(t,p){const h=t.plot;return !!h&&p.y>=h.y&&p.y<=h.y+house.config.wall_height+1&&Math.abs(p.x-h.x)<=3&&Math.abs(p.z-h.z)<=3;}
function safe(t,b,block){
 if(!block||!owned(t,block.position)||!natural(block.name)||b.entity.onGround!==true)return false;
 const q=block.position;
 if((t.campPlots||[]).some(h=>h&&(h.x!==t.plot.x||h.z!==t.plot.z)&&Math.abs(q.x-h.x)<=4&&Math.abs(q.z-h.z)<=4&&q.y>=h.y-1&&q.y<=h.y+5))return false;
 for(const p of [b.entity.position,...space.players(b)])if(Math.abs(q.y+1-p.y)<.25&&q.x<p.x+.32&&q.x+1>p.x-.32&&q.z<p.z+.32&&q.z+1>p.z-.32)return false;
 for(const [dx,dy,dz] of [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
  const v=b.blockAt(q.offset(dx,dy,dz));if(!v||['water','lava','fire','soul_fire','sand','red_sand','gravel'].includes(v.name))return false;
 }
 return space.clearOfPlayers(b,q.offset(.5,.5,.5));
}
function blocked(message){const error=Error(message);error.code='BUILD_OBSTRUCTED';return error;}
async function clear(t,b,block){
 if(empty(b.blockAt(block.position)))return false;
 if(!safe(t,b,block))throw blocked('Cannot safely clear construction obstruction '+block.name);
 const type=block.name.endsWith('_log')?'axe':EARTH.has(block.name)?(['stone','granite','diorite','andesite','deepslate','tuff'].includes(block.name)?'pickaxe':'shovel'):null;
 const tool=type&&['netherite','diamond','iron','stone','wooden','golden'].map(s=>s+'_'+type).find(n=>b.inventory.items().some(i=>i.name===n));
 if(tool)await inventory.equip(b,tool);
 t.timing?.mark(t.phase,'clearing');t.message='Clearing '+block.name+' from the house construction area';
 let removed=await access.dig(b,block,{validate:current=>safe(t,b,current)});
 // Small, offset plant shapes can miss a center ray even with a completely
 // clear reach corridor. Dig their real block, without accepting walls in front.
 if(!removed&&SOFT.has(block.name)&&require('./resource_target').withinReach(b,block.position)&&!firstObstruction(b,block.position)){
  await require('./harvest').aim(b,block.position.offset(.5,.3,.5));
  const current=b.blockAt(block.position);
  if(current?.name===block.name&&safe(t,b,current)&&b.canDigBlock(current)&&!firstObstruction(b,current.position)){
   await b.dig(current,true);removed=empty(b.blockAt(current.position));
  }
 }
 if(!removed&&empty(b.blockAt(block.position)))return false;
 if(!removed)throw blocked('Construction obstruction needs a closer safe angle: '+block.name);
 t.lastProgress=Date.now();t.constructionCleared=(t.constructionCleared||0)+1;
 return true;
}
function firstObstruction(b,target){
 const eye=b.entity.position.offset(0,b.entity.eyeHeight||1.62,0),delta=target.offset(.5,.5,.5).minus(eye),length=delta.norm(),seen=new Set();
 for(let d=.15;d<length;d+=.1){
  const p=eye.plus(delta.scaled(d/length)).floored();if(p.equals(target))break;
  const key=p.toString();if(seen.has(key))continue;seen.add(key);
  const block=b.blockAt(p);if(!block)return block;
  if(block.boundingBox!=='empty'||natural(block.name))return block;
 }
 return null;
}
async function prepare(t,b,q,name){
 const target=new Vec3(q.x,q.y,q.z),cells=name?.endsWith('_door')?[target.offset(0,1,0),target]:[target];
 let cleared=0;
 for(const cell of cells){
  // Never mine finished construction or replace existing furniture here.
  if(!empty(b.blockAt(cell))&&!natural(b.blockAt(cell)?.name||''))throw blocked('Construction cell contains '+(b.blockAt(cell)?.name||'unloaded terrain'));
  while(cleared<6){
   const obstacle=firstObstruction(b,cell);
   // The line to a below-foot floor cell can cross adjacent ground, or a
   // plant outside the house. Those are not construction cells to excavate.
   // Let normal supporting-face placement and stance recovery handle them.
   if(obstacle&&natural(obstacle.name)&&owned(t,obstacle.position)){await clear(t,b,obstacle);cleared++;continue;}
   const current=b.blockAt(cell);if(empty(current))break;
   await clear(t,b,current);cleared++;
  }
  if(!empty(b.blockAt(cell)))throw blocked('Construction obstruction remains; another safe approach is needed');
 }
}
module.exports={natural,empty,owned,safe,clear,prepare,firstObstruction};

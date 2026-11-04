const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const escape=require('../controller/escape_column'),access=require('../controller/resource_access');
function fixture(){
 const cells=new Map(),items=[{name:'dirt',count:8}],t={phase:'return_home',campPlots:[],navigator:{lastPlan:0,path:[]}},state={world:{bounds:[-20,20,-20,20]}};
 for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)if(x||z)for(let y=64;y<=65;y++)cells.set([x,y,z].join(','),'stone');
 const b={username:'EscapeUnit',players:{},entity:{id:1,position:new Vec3(.5,64,.5),onGround:true},inventory:{items:()=>items.filter(i=>i.count>0)},blockAt(p){p=p.floored();const name=cells.get(p.toArray().join(','))||(p.y<64?'stone':'air');return {name,position:p,boundingBox:name==='air'?'empty':'block',getProperties:()=>({})};},clearControlStates(){}};
 return {t,b,state,items,cells,goal:[4.5,66.1,.5],motor:{pause(){},lockLook(){}}};
}
test('a two-deep trap plans real build-up toward a checked upper landing',()=>{
 const f=fixture();f.items[0].count=1;const p=escape.plan(f.t,f.b,f.goal,f.state);assert.ok(p);assert.equal(p.rise,1);assert.equal(p.item.name,'dirt');assert.equal(p.landing[1],66.1);assert.equal(f.items[0].count,1);
});
test('a crater escape can reach its own restored floor without placing inside a room',()=>{
 const f=fixture();f.t.plot={x:0,y:66,z:0};f.t.campPlots=[f.t.plot];assert.equal(escape.plan(f.t,f.b,f.goal,f.state)?.rise,1);
 assert.equal(escape.permitted(f.t,new Vec3(0,66,0),f.state.world.bounds),false);
});
test('escape refuses missing blocks, liquids, head obstructions, nearby players and private houses',()=>{
 for(const kind of ['supplies','water','ceiling','player','home','height']){
  const f=fixture();
  if(kind==='supplies')f.items.length=0;
  if(kind==='water')f.cells.set('0,64,0','water');
  if(kind==='ceiling')f.cells.set('0,67,0','stone');
  if(kind==='player')f.b.players.other={username:'other',entity:{id:2,position:new Vec3(.5,64,1.5)}};
  if(kind==='home')f.t.campPlots=[{x:0,y:64,z:0}];
  if(kind==='height')f.t.escapeColumn={x:0,z:0,baseY:61};
  assert.equal(escape.plan(f.t,f.b,f.goal,f.state),null,kind);
 }
});
test('an ordinary walkable exit is preferred to adding a column',()=>{
 const f=fixture();for(let x=1;x<=5;x++){f.cells.delete([x,64,0].join(','));f.cells.delete([x,65,0].join(','));}
 assert.equal(escape.plan(f.t,f.b,f.goal,f.state),null);
});
test('jump recovery consumes a carried block, confirms progress and replans without changing tasks',async ctx=>{
 const f=fixture();ctx.mock.method(access,'stabilize',async()=>true);
 ctx.mock.method(access,'jumpPlace',async(b,p,item)=>{assert.equal(item.name,'dirt');f.items[0].count--;f.cells.set(p.toArray().join(','),'dirt');b.entity.position.y++;return true;});
 assert.equal(await escape.attempt(f.t,f.b,f.motor,f.goal,f.state),true);
 assert.equal(f.items[0].count,7);assert.equal(f.b.entity.position.y,65);assert.equal(f.t.phase,'return_home');assert.equal(f.t.navigator.lastPlan,-Infinity);assert.equal(f.b.labResourceAccess,undefined);
 assert.equal(await escape.attempt(f.t,f.b,f.motor,f.goal,f.state),false,'cooldown stops rapid repeated placements');
});

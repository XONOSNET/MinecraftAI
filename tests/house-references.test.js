const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const planner=require('../assets/house-references/planner.cjs'),catalog=require('../assets/house-references/houses.json');
function scan(){const blocks=[];for(let level=1;level<=4;level++){
 const x0=level*10;for(let x=x0;x<=x0+4;x++)for(let z=0;z<=4;z++)if(x===x0||x===x0+4||z===0||z===4)blocks.push({x,y:225,z,name:'redstone_block',properties:{}});
 blocks.push({x:x0+2,y:226,z:0,name:'oak_sign',properties:{},signText:String(level)+'\n\n\n'});
 for(let x=x0+1;x<x0+4;x++)for(let z=1;z<4;z++)blocks.push({x,y:225,z,name:'oak_planks',properties:{}});
 blocks.push({x:x0+2,y:226,z:1,name:'oak_door',properties:{half:'lower',facing:'south',hinge:'left',open:true}},{x:x0+2,y:227,z:1,name:'oak_door',properties:{half:'upper',facing:'south',hinge:'left'}});
 blocks.push({x:x0+2,y:227,z:0,name:'wall_torch',properties:{facing:'north'}});
 }return {bounds:[0,50,-1,5],floor_y:225,top_y:232,blocks};}

test('reference capture finds numbered outlines, keeps perimeter-mounted lights and strips only markers',()=>{
 const c=planner.compile(scan());assert.deepEqual(c.houses.map(h=>h.level),[1,2,3,4]);
 assert.ok(c.houses.every(h=>h.blocks.some(b=>b.name==='wall_torch')));
 assert.ok(c.houses.every(h=>!h.blocks.some(b=>b.name==='redstone_block'||b.name.endsWith('_sign'))));
 assert.equal(c.houses[0].materials.any_wood_door,1);assert.equal(c.houses[0].blocks.find(b=>b.name==='oak_door').properties.facing,'south');
});
test('open outlines and ambiguous numbering fail instead of importing partial houses',()=>{
 const s=scan();s.blocks=s.blocks.filter(b=>!(b.name==='redstone_block'&&b.x===10&&b.z===2));assert.throws(()=>planner.compile(s),/open/);
 const duplicate=scan();duplicate.blocks.find(b=>b.name==='oak_sign').signText='2';assert.throws(()=>planner.compile(duplicate),/distinct/);
});
test('real four-house catalog preserves all levels, substitutes froglights and counts paired furniture once',()=>{
 assert.deepEqual(catalog.houses.map(h=>h.blocks.length),[62,119,206,291]);
 assert.ok(catalog.houses.every(h=>!h.blocks.some(b=>b.name==='ochre_froglight'||b.name==='redstone_block'||b.name.endsWith('_sign'))));
 assert.ok(catalog.houses[3].blocks.filter(b=>b.name.endsWith('_planks')).every(b=>!('axis' in b.properties)));assert.equal(catalog.houses[3].materials.any_wood_planks,129);assert.equal(catalog.houses[3].materials.any_bed,1);
 assert.equal(catalog.houses[3].materials.any_wood_door,1);assert.equal(catalog.houses[3].materials.chest,6);
});
test('upgrades wait for Night 4 and completed goals; any plank mix and bed color count',()=>{
 const options={nightLevel:3,goalComplete:true,anchor:[0,64,0],readBlock:()=>({name:'air'})};
 assert.equal(planner.planUpgrade(catalog,options).state,'locked');options.nightLevel=4;options.goalComplete=false;assert.equal(planner.planUpgrade(catalog,options).state,'waiting');
 options.goalComplete=true;options.inventory={birch_planks:30,spruce_planks:23,blue_bed:1,chest:1,crafting_table:1,furnace:1,torch:2,birch_door:1};
 const plan=planner.planUpgrade(catalog,options);assert.equal(plan.state,'ready');assert.deepEqual(plan.missing,{});
 assert.equal(planner.same({name:'white_bed',properties:{facing:'east',part:'foot'}},{name:'red_bed',properties:{facing:'east',part:'foot',occupied:true}}),true);
});
test('upgrade planning refuses unknown terrain, neighboring plots and changed blocks',()=>{
 const options={nightLevel:4,goalComplete:true,anchor:[0,64,0],readBlock:()=>({name:'air'})};
 assert.equal(planner.planUpgrade(catalog,{...options,protectedAt:()=>true}).state,'blocked');
 assert.equal(planner.planUpgrade(catalog,{...options,readBlock:()=>null}).state,'blocked');
 assert.equal(planner.planUpgrade(catalog,{...options,readBlock:()=>({name:'diamond_block',properties:{}})}).state,'blocked');
 const old=catalog.houses[0],map=new Map(old.blocks.map(b=>[b.position.map((n,i)=>n+options.anchor[i]).join(','),b]));
 const p=planner.planUpgrade(catalog,{...options,currentLevel:1,readBlock:q=>map.get(q.join(','))||{name:'air'}});
 assert.ok(p.remove.length>0);assert.ok(Object.keys(p.missing).length>0,'planned salvage is not free inventory');
 assert.ok(p.remove.filter(b=>b.name==='chest').every(b=>b.requiresEmptyContainer));
});

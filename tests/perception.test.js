const {test}=require('node:test');const assert=require('node:assert/strict');const {Vec3}=require('vec3');const {scan,proximity,coneWidth}=require('../controller/perception');
function scene(){const World=require('prismarine-world')('1.21.4');const Chunk=require('prismarine-chunk')('1.21.4');const data=require('minecraft-data')('1.21.4');let w=new World();for(let x=-2;x<=1;x++)for(let z=-2;z<=1;z++)w.sync.setColumn(x,z,new Chunk());return {w:w.sync,data};}
test('sensor starts at standing eye height rather than player body height',()=>{let origins=[];scan({entity:{position:new Vec3(0,64,0),height:1.8,yaw:0,pitch:0},world:{raycast:(origin)=>{origins.push(origin.y);return null;}}});assert(origins.every(y=>Math.abs(y-65.62)<1e-9));});
test('256 rays give fixed compact input, air is empty',()=>{const {w}=scene();const s=scan({entity:{position:new Vec3(0,64,0),height:1.62,yaw:0,pitch:0},world:w});assert.equal(s.features.length,512);assert.equal(s.pooled.length,64);assert.equal(s.hits.length,0);assert(s.features.every((v,i)=>v===(i%2?0:1)));});
test('a solid wall occludes hidden ore and produces correct coordinates',()=>{const {w,data}=scene();for(let x=-8;x<=8;x++)for(let y=60;y<=72;y++){w.setBlockStateId(new Vec3(x,y,-4),data.blocksByName.stone.defaultState);w.setBlockStateId(new Vec3(x,y,-6),data.blocksByName.diamond_ore.defaultState);}const s=scan({entity:{position:new Vec3(.5,64,.5),height:1.62,yaw:0,pitch:0},world:w});assert(s.hits.length>0);assert(s.hits.every(h=>h.name==='stone'&&h.position.z===-4));assert(s.hits.every(h=>h.distance>3&&h.distance<10));});

const solid=(position,shapes=[[0,0,0,1,1,1]])=>({position,boundingBox:'block',name:'stone',shapes});
function botFor(obstacle){return {entity:{position:new Vec3(.5,1,.5),yaw:0,pitch:0},world:{raycast:()=>null},blockAt(p){return p.y<1?solid(p):obstacle(p)||{position:p,boundingBox:'empty',name:'air',shapes:[]};}};}
test('vision widens near an obstacle and central learned ray shape stays fixed',()=>{
 assert.ok(coneWidth(.5)>coneWidth(4));assert.equal(coneWidth(16),Math.PI/2);
 const b=botFor(()=>null),s=scan(b);assert.equal(s.pooled.length,64);assert.equal(s.features.length,512);assert.equal(s.vision.hfov,Math.PI/2);
});
test('wall and slab-height passage are distinguished; unsafe rear prohibits reversing',()=>{
 let b=botFor(p=>p.z<0&&p.y===2?solid(p):null);assert.equal(proximity(b).wallAhead,true);assert.equal(proximity(b).crouchClearance,false);assert.equal(proximity(b).rearSafe,true);
 b=botFor(p=>p.z<0&&p.y===2?solid(p,[[0,.5,0,1,1,1]]):null);assert.equal(proximity(b).crouchClearance,true);assert.equal(proximity(b).wallAhead,false);
 const ground=b.blockAt.bind(b);b.blockAt=p=>p.y<1&&p.z>=1?{name:'lava',boundingBox:'empty',shapes:[]}:ground(p);assert.equal(proximity(b).rearSafe,false);
 b=botFor(p=>p.z<0&&p.y===1?solid(p):null);assert.equal(proximity(b).wallAhead,false,'one-block steps remain jumpable');
});

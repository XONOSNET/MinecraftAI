const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {createDoorCare,closeDoor}=require('../controller/door_care');
function fixture(axis='z',side=-1){
 let open=true,clicks=0;const pos=new Vec3(.5,70,.5);pos[axis]=.5+side*1.5;
 const b={username:'mine',health:20,entity:{id:1,position:pos},players:{},game:{dimension:'door-test-'+Math.random()},getControlState:()=>false,canSeeBlock:()=>true,
 blockAt(p){return p.x===0&&p.z===0&&[70,71].includes(p.y)?{name:'oak_door',position:p.clone(),getProperties:()=>({open,facing:axis==='z'?'north':'east',half:p.y===71?'upper':'lower'})}:null;},
 async activateBlock(){clicks++;open=!open;}};
 return {b,care:createDoorCare(b),get open(){return open},get clicks(){return clicks}};
}
for(const axis of ['x','z'])for(const side of [-1,1])test(`closes after clearing doorway in ${axis} direction ${side}`,async()=>{
 const f=fixture(axis,side);await f.care.update(1000);
 f.b.entity.position[axis]=.5-side*.5;await f.care.update(1200);assert.equal(f.clicks,0,'body still overlaps doorway');
 f.b.entity.position[axis]=.5-side*1.1;await f.care.update(1400);assert.equal(f.open,false);assert.equal(f.clicks,1);
 await f.care.update(1600);assert.equal(f.clicks,1,'must not toggle a closed door open again');
});
test('waits for other players to clear the frame; spectator cameras do not block closure',async()=>{
 const f=fixture();await f.care.update(1000);f.b.entity.position.z=1.7;
 f.b.players.other={gamemode:0,entity:{id:2,position:new Vec3(.5,70,.5)}};
 await f.care.update(1200);assert.equal(f.open,true);
 f.b.players.other.gamemode=3;await f.care.update(1400);assert.equal(f.open,false);
});
test('passing beside a door, teleporting away or remaining on the entry side never closes it',async()=>{
 const f=fixture();f.b.entity.position.x=2;await f.care.update(1000);f.b.entity.position.z=1.7;await f.care.update(1200);assert.equal(f.clicks,0);
 f.b.entity.position=new Vec3(.5,70,-1);await f.care.update(1400);f.b.entity.position.z=100;await f.care.update(1600);assert.equal(f.clicks,0);
});
test('native close uses a server interaction without changing camera-facing angles',async()=>{
 const f=fixture();f.b.entity.position.z=1.7;f.b.entity.yaw=.7;f.b.entity.pitch=.2;f.b.version='1.21.4';f.b.swingArm=()=>{};
 f.b._client={write(packet,data){assert.equal(packet,'block_place');assert.equal(data.hand,0);f.b.activateBlock();}};
 assert.equal(await closeDoor(f.b,f.b.blockAt(new Vec3(0,70,0))),true);
 assert.equal(f.b.entity.yaw,.7);assert.equal(f.b.entity.pitch,.2);
});
test('approaching then detouring around a door does not count as crossing it',async()=>{
 const f=fixture();await f.care.update(1000);
 f.b.entity.position.x=2.5;await f.care.update(1200);
 f.b.entity.position.z=1.7;await f.care.update(1400);
 assert.equal(f.clicks,0);
});

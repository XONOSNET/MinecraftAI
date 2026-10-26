const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),house=require('../controller/house'),lighting=require('../controller/house_lighting');
test('both torches mount on vertical house walls without occupying doors or furniture',()=>{
 const plot={x:10,y:64,z:20},shell=house.blueprint(plot);
 for(const side of ['indoor','outdoor']){
  const m=house.torchMount(plot,side);assert.equal(m.face.y,0);assert.ok(shell.some(q=>new Vec3(q.x,q.y,q.z).equals(m.support)));
  assert.ok(!shell.some(q=>new Vec3(q.x,q.y,q.z).equals(m.position)));assert.ok(m.position.y>plot.y);
  assert.ok(m.position.x!==plot.x,'Keep the door and entrance clear');
 }
 assert.ok(house.torchMount(plot,'indoor').position.z>plot.z-3);assert.ok(house.torchMount(plot,'outdoor').position.z<plot.z-3);
});
test('floor torches and incorrectly oriented wall torches do not satisfy lighting verification',()=>{
 const plot={x:0,y:64,z:0};let name='torch',facing='east';const bot={blockAt:()=>({name,getProperties:()=>({facing})})};
 assert.equal(lighting.missing(bot,plot),2);name='wall_torch';assert.equal(lighting.installed(bot,plot,'indoor'),true);assert.equal(lighting.installed(bot,plot,'outdoor'),false);
 facing='north';assert.equal(lighting.installed(bot,plot,'outdoor'),true);
});
test('verified wall torches are retained without consuming another item',async()=>{
 const plot={x:0,y:64,z:0},bot={blockAt:p=>({name:'wall_torch',getProperties:()=>({facing:p.equals(house.torchMount(plot,'indoor').position)?'east':'north'})}),placeBlock:async()=>assert.fail('Already installed')};
 await lighting.place(bot,plot,'indoor');await lighting.place(bot,plot,'outdoor');assert.equal(lighting.missing(bot,plot),0);
});

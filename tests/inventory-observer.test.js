const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {publish,snapshot}=require('../controller/inventory_observer');
const item=(name,count)=>({name,count});
function bot(username){
 return {username,entity:{id:1},quickBarSlot:3,inventory:{slots:Array(46).fill(null),selectedItem:null}};
}
test('open container uses its live player slots without losing equipment or cursor',()=>{
 const b=bot('LabAI2');
 b.inventory.slots[9]=item('coal',3);
 b.inventory.slots[5]=item('iron_helmet',1);
 b.inventory.slots[45]=item('shield',1);
 b.currentWindow={type:'minecraft:generic_9x6',inventoryStart:54,slots:Array(90).fill(null),selectedItem:item('oak_log',5)};
 b.currentWindow.slots[53]=item('charcoal',21);
 b.currentWindow.slots[54]=item('stick',12);
 const view=snapshot(b,100);
 assert.equal(view.window.slots.length,54);
 assert.deepEqual(view.window.slots[53],{id:'minecraft:charcoal',count:21});
 assert.equal(view.player[9].id,'minecraft:stick');
 assert.equal(view.player[5].id,'minecraft:iron_helmet');
 assert.equal(view.player[45].id,'minecraft:shield');
 assert.equal(view.cursor.count,5);
 assert.equal(view.selected,3);
 b.currentWindow=null;b.inventory.slots[0]=item('oak_planks',4);b.inventory.slots[1]=item('oak_log',1);
 assert.equal(snapshot(b).window.type,'crafting_2x2');
 assert.equal(snapshot(b).window.slots[0].count,4);
});
test('only fresh operator follow requests receive the selected bot, including after a camera switch',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lab-observer-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'data/inventory-observer');
 await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(root,'server'));
 const write=(p,v)=>fs.writeFile(path.join(root,p),JSON.stringify(v));
 await write('server/ops.json',[{name:'Admin'},{name:'Expired'}]);
 const follow=(player,target,attached=true)=>({player,target,enabled:true,attached});
 const sessions={Admin:follow('Admin','LabAI0'),Visitor:follow('Visitor','LabAI0'),Expired:follow('Expired','LabAI0')};
 await write('data/observers.json',sessions);
 for(const name of Object.keys(sessions))await fs.writeFile(path.join(dir,'request-'+name),'');
 await fs.utimes(path.join(dir,'request-Expired'),new Date(0),new Date(0));
 const bots=[bot('LabAI0'),bot('LabAI1')],view=owner=>fs.readFile(path.join(dir,'snapshot-'+owner+'.json'),'utf8').then(JSON.parse);
 await publish(root,bots);
 assert.equal((await view('Admin')).bot,'LabAI0');
 for(const n of ['Visitor','Expired'])await assert.rejects(view(n),{code:'ENOENT'});
 sessions.Admin=follow('Admin','LabAI1',false);await write('data/observers.json',sessions);
 const before=await view('Admin');await publish(root,bots);assert.deepEqual(await view('Admin'),before);
 sessions.Admin.attached=true;await write('data/observers.json',sessions);
 await publish(root,bots);assert.equal((await view('Admin')).bot,'LabAI1');
});

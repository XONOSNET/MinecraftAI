// Isolated protocol fixture on an existing lab floor, removed afterward.
// Supplies belong only to this diagnostic account; no training writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const {HutTeacher}=require('../controller/hut_teacher'),inventory=require('../controller/inventory_sync');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBuildCheck',version:'1.21.4'});inventory.attach(b);
const report={fixture:'Temporary poppy wall, dirt wall and leaf ceiling, real survival digging and verified placement. No learning writes.',cases:[]};
let op=false,created=false;
const cells=[[3,181,-15],[-3,181,-15],[0,184,-15],...[181,182,183,184].map(y=>[1,y,-15])];
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Diagnostic not online');}
async function command(text){b.chat('/'+text);await wait(120);}
b.once('spawn',async()=>{try{
 await wait(1500);await admin({action:'gamemode',gamemode:'survival'});await admin({action:'teleport-coordinates',x:.5,y:181,z:-13.5});await wait(1200);
 if(process.argv.includes('--recover-fixture')){
  for(const p of cells)if(!['air','poppy','dirt','oak_leaves','oak_planks'].includes(b.blockAt(new Vec3(...p))?.name))throw Error('Unexpected block in owned diagnostic fixture');
  await admin({action:'op'});op=true;await wait(500);for(const p of cells)await command('setblock '+p.join(' ')+' air');await wait(300);
 }
 for(const p of cells)if(b.blockAt(new Vec3(...p))?.name!=='air')throw Error('Fixture area is occupied; no edits made');
 if(b.blockAt(new Vec3(3,180,-15))?.boundingBox!=='block'||b.blockAt(new Vec3(-3,180,-15))?.boundingBox!=='block')throw Error('No existing support floor');
 await admin({action:'op'});op=true;await wait(500);created=true;
 await command('clear @s');for(const item of ['oak_planks 16','wooden_axe','wooden_shovel'])await command('give @s '+item);
 for(const y of [181,182,183,184])await command(`setblock 1 ${y} -15 oak_planks`);
 await command('setblock 3 181 -15 poppy');await command('setblock -3 181 -15 dirt');await command('setblock 0 184 -15 oak_leaves[persistent=true]');
 await admin({action:'deop'});op=false;await wait(300);
 const t=new HutTeacher();Object.assign(t,{plot:{x:0,y:181,z:-15},campPlots:[],phase:'build'});
 for(const [p,expected] of [[[3,181,-15],'poppy'],[[-3,181,-15],'dirt'],[[0,184,-15],'oak_leaves']]){
  const q=new Vec3(...p),before=b.blockAt(q)?.name;if(before!==expected)throw Error('Fixture did not initialize '+expected);
  const started=Date.now();await t.place(b,q,'oak_planks');const after=b.blockAt(q)?.name;
  report.cases.push({before,after,seconds:(Date.now()-started)/1000});if(after!=='oak_planks')throw Error('Placement was not verified');
 }
 report.cleared=t.constructionCleared;report.health=b.health;report.success=report.cleared===3&&report.health===20;
 }catch(e){report.error=e.stack;}finally{
  if(created){if(!op){await admin({action:'op'});op=true;await wait(500);}for(const p of cells)await command('setblock '+p.join(' ')+' air');await command('kill @e[type=minecraft:item,x=-4,y=181,z=-19,dx=8,dy=6,dz=8]');await command('clear @s');await wait(300);report.cleanup_verified=cells.every(p=>b.blockAt(new Vec3(...p))?.name==='air');if(!report.cleanup_verified)report.success=false;}
  if(op)await admin({action:'deop'}).catch(()=>{});
  await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});
  fs.writeFileSync('logs/construction-clearance-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));b.quit();setTimeout(()=>process.exit(report.success?0:1),250);
 }});
setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

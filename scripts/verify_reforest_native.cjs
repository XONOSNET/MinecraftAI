// Supplies are diagnostic only. Real survival placement; no learning writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),forest=require('../controller/reforest'),inventory=require('../controller/inventory_sync');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabForestCheck',version:'1.21.4'});inventory.attach(b);
const result={fixture:'Verified-empty sky grass platform and diagnostic saplings; actual survival planting, no global time changes or training data.'};let changed=false,finished=false;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(130);}await wait(650);await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;try{if(changed)await commands(['clear @s','fill -316 209 -316 -307 218 -307 air']);await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/reforest-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1800);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-311.5,y:220,z:-311.5});await wait(1800);
 for(let x=-316;x<=-307;x++)for(let z=-316;z<=-307;z++)for(let y=209;y<=218;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume is not empty');
 changed=true;await commands(['fill -316 209 -316 -307 209 -307 grass_block','clear @s','give @s oak_sapling 2','give @s stone_axe','tp @s -311.5 210 -311.5','gamemode survival @s']);await wait(800);await inventory.equip(b,'stone_axe');
 if(b.game.gameMode!=='survival')throw Error('Planting test must be survival');
 const t={phase:'gather',plot:{x:-350,y:210,z:-350},campPlots:[],navigator:{path:[]},lastProgress:Date.now()},state={run:'reforest-native',world:{count:1,bounds:[-370,-290,-370,-290]}},motor={lockLook(){},pause(){throw Error('Unexpected interruption');}};
 result.initial_velocity=b.entity.velocity;result.eligible=forest.idle(t,b,state);
 if(!await forest.tick(t,b,motor,state,{random:()=>0})){
  const p=new Vec3(-309,210,-312),eye=b.entity.position.offset(0,b.entity.eyeHeight||1.62,0),delta=p.offset(.5,0,.5).minus(eye),hit=b.world.raycast(eye,delta.scaled(1/delta.norm()),delta.norm()+.1);
  result.debug={position:b.entity.position,eyeHeight:b.entity.eyeHeight,ground:b.blockAt(p.offset(0,-1,0))?.name,target:b.blockAt(p)?.name,sky:b.blockAt(p)?.skyLight,light:b.blockAt(p)?.light,hit:hit?{name:hit.name,position:hit.position}:null,safe:forest.safe(t,b,state,[p],'oak_sapling'),items:b.inventory.items().map(i=>({name:i.name,count:i.count})),players:require('../controller/resource_space').players(b)};
  throw Error('No plant: '+JSON.stringify(t.reforest));
 }
 result.oak={...t.reforest.last,verified:b.blockAt(new Vec3(...t.reforest.last.position))?.name,tool:b.heldItem?.name};
 await commands(['fill -316 210 -316 -307 218 -307 air','clear @s oak_sapling','give @s pale_oak_sapling 4','give @s mangrove_propagule 1']);await wait(400);
 // Check the special 2x2 species using only that collected stack first.
 await commands(['clear @s mangrove_propagule']);t.reforest=null;t.lastProgress=Date.now();
 if(!await forest.tick(t,b,motor,state,{random:()=>0}))throw Error('No pale oak group: '+JSON.stringify(t.reforest));
 result.group={planted:t.reforest.planted,pending:t.reforest.pending,tool:b.heldItem?.name};
 await commands(['fill -316 210 -316 -307 218 -307 air','give @s mangrove_propagule']);t.reforest=null;t.lastProgress=Date.now();await wait(300);
 if(!await forest.tick(t,b,motor,state,{random:()=>0}))throw Error('No propagule: '+JSON.stringify(t.reforest));
 result.mangrove={...t.reforest.last,verified:b.blockAt(new Vec3(...t.reforest.last.position))?.name,tool:b.heldItem?.name};
 result.success=result.oak.verified==='oak_sapling'&&result.group.planted===4&&!result.group.pending&&result.mangrove.verified==='mangrove_propagule'&&b.heldItem?.name==='stone_axe';
}catch(error){result.error=error.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});
setTimeout(()=>{result.error='Native verification deadline';result.success=false;finish();},90000).unref();

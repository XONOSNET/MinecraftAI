// Isolated native regression: main-inventory axe -> held axe -> actual sheep hits.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey'),inventory=require('../controller/inventory_sync'),combat=require('../controller/combat');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabHuntGear',version:'1.21.4'}),result={fixture:'Empty sky, isolated sheep and diagnostic inventory only; no production learning writes.'};inventory.attach(b);
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return;const s=await r.text();if(!s.includes('not online'))throw Error(s);await wait(500);}throw Error('Diagnostic unavailable');}
async function cmd(c){b.chat('/'+c);await wait(350);}
b.once('spawn',async()=>{let built=false;try{
 await wait(1400);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-80.5,y:180,z:158.5});await wait(1300);
 for(let x=-88;x<=-55;x++)for(let y=176;y<=185;y++)for(let z=150;z<=168;z++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Fixture must be empty sky');
 await admin({action:'op'});await wait(600);built=true;
 for(const c of ['fill -88 179 150 -55 179 168 sea_lantern','clear @s','item replace entity @s inventory.0 with minecraft:stone_axe','summon sheep -78.5 180 158.5 {NoAI:1b,PersistenceRequired:1b,Tags:["lab_hunt_gear_fixture"]}'])await cmd(c);
 await inventory.sync(b);result.before={held:b.heldItem?.name||null,axeSlot:b.inventory.items().find(i=>i.name==='stone_axe')?.slot};
 if(result.before.held||result.before.axeSlot!==9)throw Error('Expected empty hand and axe in main inventory slot 9');
 await admin({action:'deop'});survey.release(b);await admin({action:'gamemode',gamemode:'survival'});await wait(600);
 const enemy=Object.values(b.entities).find(e=>e.name==='sheep'&&e.position.distanceTo(b.entity.position)<4);if(!enemy)throw Error('Fixture sheep did not spawn');
 const task={kind:'combat',combat_style:'hunt',auto_equip_for_attack:true,mobs:['sheep'],mob_label:'',target_id:enemy.id,bounds:[-90,-53,148,170],min_y:179,max_y:185,weapon:'stone_axe',kill_target:1,attack_delay_ms:1000},runtime={};b.on('entityDead',e=>combat.death(e,task,runtime));
 const preparation=await combat.interact(b,task,combat.observe(b,task,runtime),runtime,6,{combat_practice:true});
 result.preparation={returned:preparation,held:b.heldItem?.name,hits:runtime.hits||0};if(preparation||runtime.hits||b.heldItem?.name!=='stone_axe')throw Error('Preparation did not correctly equip without counting hit');
 const at=Date.now();while(!runtime.kills&&Date.now()-at<7000){await combat.interact(b,task,combat.observe(b,task,runtime),runtime,6,{combat_practice:true});await wait(100);}
 result.hunting={hits:runtime.hits||0,kills:runtime.kills||0,seconds:(Date.now()-at)/1000};result.success=runtime.kills===1;if(!result.success)throw Error('Native sheep kill did not verify');
}catch(e){result.error=e.stack;}finally{
 survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'}).catch(()=>{});
 if(built){await admin({action:'op'}).catch(()=>{});await wait(600);await cmd('kill @e[tag=lab_hunt_gear_fixture]');await cmd('kill @e[type=item,x=-88,y=176,z=150,dx=33,dy=10,dz=18]');await cmd('fill -88 176 150 -55 185 168 air');await cmd('clear @s');}
 await admin({action:'deop'}).catch(()=>{});await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});b.quit();fs.writeFileSync('docs/hunt-gear-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));setTimeout(()=>process.exit(result.success?0:1),200);
}});

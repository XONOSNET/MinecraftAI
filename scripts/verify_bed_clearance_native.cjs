// Diagnostic build only; all navigation and leaf clearing are real survival actions.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-500,y:211,z:-500},result={fixture:'Return from out-of-reach mining stance, approach a real support and place furnace in survival. No learning writes.'};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabBedTest',version:'1.21.4'});inventory.attach(b);let changed=false,finished=false,motor;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(100);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;motor?.pause();try{await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['kill @e[type=item,x=-507,y=209,z=-510,dx=14,dy=8,dz=17]','fill -507 209 -510 -493 217 -493 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/bed-clearance-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-500,y:220,z:-500});await wait(1800);
 for(let x=-507;x<=-493;x++)for(let z=-510;z<=-493;z++)for(let y=209;y<=217;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume not empty');
 changed=true;await commands(['fill -507 209 -510 -493 209 -493 grass_block','fill -503 210 -503 -497 210 -497 oak_planks','clear @s','give @s white_bed 1','setblock -498 211 -500 snow[layers=1]','tp @s -499.5 211 -499.5']);
 await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(600);
 const t=new HutTeacher();Object.assign(t,{plot,campPlots:[plot],phase:'night_bed',wilderness:{},milestones:[]});motor={pause(){b.clearControlStates();}};
 const start=Date.now();await require('../controller/first_night').tick(t,b,motor,{run:'diagnostic-bed',world:{}},async()=>({diagnostic_only:true}));
 const foot=require('../controller/house').point(plot,'bed'),head=foot.offset(0,0,1);
 result.fixture='Survival bed placement after clearing a snow layer from its head cell; no learning writes';result.seconds=(Date.now()-start)/1000;result.foot=b.blockAt(foot)?.name;result.head=b.blockAt(head)?.name;result.health=b.health;result.mode=b.game.gameMode;
 result.success=result.foot==='white_bed'&&result.head==='white_bed'&&t.phase==='night_scout'&&b.health===20&&b.game.gameMode==='survival';

}catch(e){result.beds=[];for(let x=-503;x<=-497;x++)for(let z=-503;z<=-497;z++){const p=new Vec3(x,211,z),block=b.blockAt(p);if(block?.name.endsWith('_bed'))result.beds.push({position:p.toArray(),properties:block.getProperties()});}result.position=b.entity?.position.toArray();result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});setTimeout(()=>{result.error='Native test deadline';result.success=false;finish();},160000).unref();

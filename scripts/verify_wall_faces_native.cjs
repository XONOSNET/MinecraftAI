// Diagnostic build only; all navigation and leaf clearing are real survival actions.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),inventory=require('../controller/inventory_sync'),{HutTeacher}=require('../controller/hut_teacher'),{WorldNavigation,homeApproach}=require('../controller/world_navigation'),{WorldTiming}=require('../controller/world_timing'),{route}=require('../controller/field_navigation'),{createMotor}=require('../controller/locomotion'),{scan}=require('../controller/perception'),tasks=require('../controller/tasks');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),plot={x:-500,y:211,z:-500},result={fixture:'Real survival placement into high wall and ceiling gaps using visible support faces. No learning writes.'};
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabWallFaces',version:'1.21.4'});inventory.attach(b);let changed=false,finished=false,motor;
async function post(data){for(let n=0;n<8;n++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)return r.json();if(n===7)throw Error(await r.text());await wait(500);}}
async function commands(list){await post({action:'op',player:b.username});await wait(1000);for(const c of list){b.chat('/'+c);await wait(100);}await post({action:'deop',player:b.username});await wait(400);}
async function finish(){if(finished)return;finished=true;motor?.pause();try{await post({action:'teleport-coordinates',player:b.username,x:-153.5,y:225.1,z:160.5});if(changed)await commands(['kill @e[type=item,x=-507,y=209,z=-510,dx=14,dy=8,dz=17]','fill -507 209 -510 -493 217 -493 air']);await post({action:'deop',player:b.username});result.cleaned=true;}catch(e){result.cleanup_error=e.message;result.success=false;}fs.writeFileSync('logs/wall-faces-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),300);}
b.once('spawn',async()=>{try{
 await wait(1500);await post({action:'gamemode',player:b.username,gamemode:'creative'});await post({action:'teleport-coordinates',player:b.username,x:-500,y:220,z:-500});await wait(1800);
 for(let x=-507;x<=-493;x++)for(let z=-510;z<=-493;z++)for(let y=209;y<=217;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Diagnostic volume not empty');
 changed=true;await commands(['fill -507 209 -510 -493 209 -493 grass_block','fill -503 210 -503 -497 210 -497 grass_block','fill -503 211 -503 -497 213 -497 oak_planks hollow','fill -503 214 -503 -497 214 -497 oak_planks','fill -502 211 -502 -498 213 -498 air','fill -500 211 -503 -500 212 -503 air','clear @s','give @s oak_door','tp @s -499.5 211 -499.5']);await wait(300);
 const q=new Vec3(plot.x+3,plot.y+2,plot.z),roof=new Vec3(plot.x,plot.y+3,plot.z);
 await commands(['clear @s','give @s oak_planks 8',`setblock ${q.x} ${q.y} ${q.z} air`,`setblock ${roof.x} ${roof.y} ${roof.z} air`,`tp @s ${plot.x+1.5} ${plot.y} ${plot.z+1.5}`]);
 await post({action:'gamemode',player:b.username,gamemode:'survival'});await wait(600);
 const t=new HutTeacher();Object.assign(t,{plot,campPlots:[plot],phase:'build'});result.placements=[];
 const original=b._placeBlockWithOptions.bind(b);b._placeBlockWithOptions=async(block,face,opts)=>{result.placements.push({support:block.position,face,target:block.position.plus(face)});return original(block,face,opts);};
 const start=Date.now();await t.place(b,q,'oak_planks');await t.place(b,roof,'oak_planks');
 result.seconds=Math.round((Date.now()-start)/100)/10;result.wall=b.blockAt(q)?.name;result.roof=b.blockAt(roof)?.name;result.health=b.health;result.mode=b.game.gameMode;result.success=result.wall==='oak_planks'&&result.roof==='oak_planks'&&b.health===20&&b.game.gameMode==='survival';

}catch(e){result.error=e.stack;result.success=false;}finally{await finish();}});
b.on('kicked',reason=>{result.error='Disconnected: '+JSON.stringify(reason);result.success=false;finish();});setTimeout(()=>{result.error='Native test deadline';result.success=false;finish();},160000).unref();

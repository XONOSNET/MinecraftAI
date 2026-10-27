// Build the requested permanent sky lounge in verified empty sky; --existing only checks it.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms)),b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabPadCheck',version:'1.21.4'});
const post=async data=>{const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify(data)});if(!r.ok){const message=await r.text();if(message.includes('not online')&&(data._retries||0)<8){await wait(500);return post({...data,_retries:(data._retries||0)+1});}throw Error(message);}};
b.once('spawn',async()=>{const data=JSON.parse(fs.readFileSync('logs/staging-build.json','utf8')),result={fixture:'Permanent sky lounge built only after checking empty sky; actual floor, rail, lighting and survival landing verification.'};let op=false;
 try{
  await wait(2000);await post({action:'gamemode',player:b.username,gamemode:'spectator'});await post({action:'teleport-coordinates',player:b.username,x:-159.5,y:235,z:160.5});await wait(2500);
  if(!process.argv.includes('--existing')){
   for(let x=-175;x<=-145;x++)for(let z=145;z<=175;z++)for(let y=223;y<=232;y++)if(b.blockAt(new Vec3(x,y,z))?.name!=='air')throw Error('Reserved sky is not empty at '+[x,y,z]);
   await post({action:'op',player:b.username});op=true;await wait(1000);b.chat('/forceload add -174 146 -146 174');await wait(1000);
   for(const command of data.commands){b.chat('/'+command);await wait(60);}
   await post({action:'deop',player:b.username});op=false;await wait(1000);
  }
  let floor=0,rail=0,lights=0;for(let dx=-14;dx<=14;dx++)for(let dz=-14;dz<=14;dz++)if(dx*dx+dz*dz<=196){const p=new Vec3(-160+dx,224,160+dz),block=b.blockAt(p);if(block?.boundingBox!=='block')throw Error('Missing deck floor: '+p);floor++;if(block.name==='sea_lantern')lights++;if(dx*dx+dz*dz>169){if(b.blockAt(p.offset(0,1,0))?.name!=='cyan_stained_glass')throw Error('Missing perimeter rail');rail++;}}
  for(const p of data.positions)if(b.blockAt(new Vec3(Math.floor(p[0]),225,Math.floor(p[2])))?.name!=='cyan_carpet')throw Error('Missing waiting spot');
  await post({action:'gamemode',player:b.username,gamemode:'survival'});const p=data.positions[0];await post({action:'teleport-coordinates',player:b.username,x:p[0],y:p[1],z:p[2]});await wait(1500);
  result.floor_blocks=floor;result.rail_blocks=rail;result.light_tiles=lights;result.slots=8;result.landing=b.entity.position;result.health=b.health;result.success=b.entity.onGround&&Math.abs(b.entity.position.y-225.0625)<.02&&b.health===20;result.center=data.center;
 }catch(e){result.error=e.stack;}finally{if(op)await post({action:'deop',player:b.username}).catch(()=>{});fs.writeFileSync('docs/staging-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));b.quit();setTimeout(()=>process.exit(result.success?0:1),200);}
});setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

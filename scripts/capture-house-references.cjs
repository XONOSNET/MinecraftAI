// Read-only import: diagnostic spectator reads blocks; no commands edit the world.
const fs=require('fs'),path=require('path'),{once}=require('events'),{Vec3}=require('vec3'),mineflayer=require('mineflayer');
const {compile}=require('../assets/house-references/planner.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function capture({base='http://127.0.0.1:8000',host='127.0.0.1',port=25565}={}){
 const token=fs.readFileSync(path.join(__dirname,'../data/api-token'),'utf8').trim();
 const bot=mineflayer.createBot({host,port,username:'LabHouseScan',version:'1.21.4',auth:'offline'});
 const admin=async data=>{for(let i=0;i<15;i++){
  const response=await fetch(base+'/admin/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':token},body:JSON.stringify({player:bot.username,...data})});
  if(response.ok)return;await wait(400);
 }throw Error('Reference scan player unavailable');};
 try{
  await Promise.race([once(bot,'spawn'),new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(Error('Reference scan connection timed out')),20000);timeout.unref();})]);
  await wait(1200);await admin({action:'gamemode',gamemode:'spectator'});await admin({action:'teleport-coordinates',x:-46,y:234,z:447});await wait(1500);await bot.waitForChunksToLoad();
  const scan={bounds:[-68,-24,441,453],floor_y:225,top_y:232,blocks:[]};
  for(let x=-68;x<=-24;x++)for(let z=441;z<=453;z++)for(let y=225;y<=232;y++){
   const b=bot.blockAt(new Vec3(x,y,z));if(!b)throw Error('Reference scan contains unloaded blocks');
   if(!['air','cave_air','void_air'].includes(b.name))scan.blocks.push({x,y,z,name:b.name,properties:b.getProperties(),...(b.name.endsWith('_sign')?{signText:b.signText}:{})});
  }
  return compile(scan);
 }finally{bot.quit();}
}
if(require.main===module){
 const output=process.argv[2];if(!output)throw Error('Specify output JSON path; existing blueprints are never overwritten implicitly');
 capture().then(catalog=>{fs.writeFileSync(output,JSON.stringify(catalog,null,2)+'\n');console.log(catalog.houses.map(h=>`House ${h.level}: ${h.blocks.length} blocks`).join('\n'));process.exit(0);}).catch(error=>{console.error(error.message);process.exit(1);});
}
module.exports={capture};

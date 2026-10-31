// Read-only survival-mode survey of the current site. No learning or terrain writes.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3');
const survey=require('../controller/survey'),{claimPlot,surface}=require('../controller/hut_teacher');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),token=fs.readFileSync('data/api-token','utf8').trim();
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabPlotCheck',version:'1.21.4'});
const report={read_only:true,plots:[]};
async function admin(data){
 for(let i=0;i<15;i++){
  const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:bot.username,...data})});
  if(r.ok)return;const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);
 }
 throw Error('Survey observer not online');
}
bot.once('spawn',async()=>{
 try{
  survey.hold(bot);await wait(1200);await admin({action:'gamemode',gamemode:'survival'});
  const s=await(await fetch('http://127.0.0.1:8000/status')).json(),w=s.world_training.session;
  if(process.argv.includes('--pristine')){w.bounds=[w.bounds[0]+1024,w.bounds[1]+1024,w.bounds[2],w.bounds[3]];report.pristine=true;}
  report.bounds=w.bounds;report.source_run=w.run;
  await admin({action:'teleport-coordinates',x:(w.bounds[0]+w.bounds[1])/2,y:196,z:(w.bounds[2]+w.bounds[3])/2});
  await wait(5000);const start=Date.now();
  for(let index=0;index<8;index++){
   const p=claimPlot(bot,{bounds:w.bounds,count:8,index,spread:9},'native-plot-check');
   if(!p)throw Error('No plot for bot '+index);
   for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(surface(bot,p.x+dx,p.z+dz)!==p.y)throw Error('Unsafe footing');
   for(const q of report.plots)if(Math.abs(p.x-q.x)<10&&Math.abs(p.z-q.z)<10)throw Error('Overlapping home yards');
   report.plots.push(p);
  }
  report.survey_ms=Date.now()-start;report.mode=bot.game.gameMode;report.success=true;
 }catch(e){report.error=e.stack;}
 finally{
  await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});survey.release(bot);
  fs.writeFileSync('logs/plot-allocation-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));bot.quit();setTimeout(()=>process.exit(report.success?0:1),200);
 }
});
setTimeout(()=>{bot.quit();process.exit(1);},90000).unref();

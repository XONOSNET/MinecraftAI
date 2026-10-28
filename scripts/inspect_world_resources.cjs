// Read-only resource census: spectator observer, no terrain edits or learning calls.
const fs=require('fs'),mineflayer=require('mineflayer'),{Vec3}=require('vec3'),survey=require('../controller/survey');
const {surface}=require('../controller/hut_teacher'),{withinReach}=require('../controller/resource_target'),{visibleBlock}=require('../controller/target_scan'),{obstruction}=require('../controller/resource_access');
const token=fs.readFileSync('data/api-token','utf8').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LabResourceCheck',version:'1.21.4'}),report={read_only:true};
async function admin(data){for(let i=0;i<15;i++){const r=await fetch('http://127.0.0.1:8000/admin/action',{method:'POST',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},body:JSON.stringify({player:b.username,...data})});if(r.ok)return r.json();const text=await r.text();if(!text.includes('not online'))throw Error(text);await wait(500);}throw Error('Observer not listed');}
const LOG=/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/;
async function census(bounds,shift=0){
 const [x0,x1,z0,z1]=bounds,logs=[],missing=[],cache=new Map(),local=new Vec3(0,0,0);let loaded=0;const column_ids=[];
 const isLog=id=>{if(!cache.has(id))cache.set(id,LOG.test(b.registry.blocksByStateId[id]?.name||''));return cache.get(id);};
 for(let cx=Math.floor((x0+shift)/16);cx<Math.ceil((x1+shift)/16);cx++)for(let cz=Math.floor(z0/16);cz<Math.ceil(z1/16);cz++){
  const column=b.world.getColumn(cx,cz);if(!column){missing.push([cx,cz]);continue;}loaded++;column_ids.push(cx+','+cz);
  for(let sy=2;sy<=7;sy++){const section=column.sections[sy-(b.game.minY>>4)];if(!section||section.palette&&!section.palette.some(isLog))continue;
   for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=sy*16;y<sy*16+16;y++){
    local.x=x;local.z=z;local.y=y;if(isLog(column.getBlockStateId(local)))logs.push(new Vec3(cx*16+x,y,cz*16+z));
   }
  }await new Promise(r=>setImmediate(r));
 }
 return {loaded_columns:loaded,column_ids,missing_columns:missing,log_blocks:logs.length,trunk_columns:new Set(logs.map(p=>p.x+','+p.z)).size,logs};
}
function safeResource(p){for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-2;dy<=1;dy++){const q=b.blockAt(p.offset(dx,dy,dz));if(!q||['water','lava','fire','soul_fire'].includes(q.name))return false;}return true;}
b.once('spawn',async()=>{try{
 await wait(1800);survey.hold(b);await admin({action:'gamemode',gamemode:'spectator'});
 const s=await(await fetch('http://127.0.0.1:8000/status')).json(),c=s.world_training.session,bounds=c.bounds;
 report.run=c.run;report.bounds=bounds;report.height_range=[32,127];
 await admin({action:'teleport-coordinates',x:(bounds[0]+bounds[1])/2,y:85,z:(bounds[2]+bounds[3])/2});await wait(2500);
 const current=await census(bounds),ring=await census([bounds[0]-16,bounds[1]+16,bounds[2]-16,bounds[3]+16]);
 const safe=current.logs.filter(safeResource),heights=new Map();let reachable=0,raised=0;
 for(const v of safe){let ground=false,build=false;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const x=v.x+dx,z=v.z+dz,key=x+','+z;if(!heights.has(key))heights.set(key,surface(b,x,z));const y=heights.get(key);if(y===null)continue;
  ground ||= withinReach(b,v,new Vec3(x+.5,y+.1,z+.5));build ||= v.y-y>=3&&v.y-y<=7;
 }if(ground)reachable++;else if(build)raised++;}
 report.live={...current,logs:undefined,column_ids:undefined,safe_water_filter:safe.length,ground_reach_geometry:reachable,additional_height_budget_geometry:raised};
 report.surrounding_one_chunk_ring={loaded_columns:ring.loaded_columns,missing_columns:ring.missing_columns,log_blocks:ring.log_blocks-current.log_blocks};
 report.current_bot_sensor_candidates={};
 for(const [name,a] of Object.entries(s.agents)){
  const proxy=Object.create(b);proxy.username=name;proxy.entity={...b.entity,position:new Vec3(...a.position)};
  const inRange=current.logs.filter(p=>p.distanceTo(proxy.entity.position)<=64&&p.y>proxy.entity.position.y-5&&p.y<proxy.entity.position.y+8);
  const eligible=inRange.filter(p=>safeResource(p)&&(visibleBlock(proxy,b.blockAt(p))||obstruction(proxy,p)));
  report.current_bot_sensor_candidates[name]={in_height_and_distance:inRange.length,eligible_after_safety_and_visibility:eligible.length,wood_logs:c.results[name]?.logs,house_blocks:c.results[name]?.blocks};
 }
 await admin({action:'teleport-coordinates',x:(bounds[0]+bounds[1])/2+1024,y:85,z:(bounds[2]+bounds[3])/2});await wait(2500);
 let original=await census(bounds,1024);const originals=new Map(original.logs.map(p=>[p.toString(),p])),columns=new Set(original.column_ids);
 for(const [dx,dz] of [[8,8],[120,8],[8,120],[120,120]]){
  if(columns.size===64)break;
  await admin({action:'teleport-coordinates',x:bounds[0]+1024+dx,y:85,z:bounds[2]+dz});await wait(1200);
  original=await census(bounds,1024);for(const p of original.logs)originals.set(p.toString(),p);for(const id of original.column_ids)columns.add(id);
 }
 report.saved_template={loaded_columns:columns.size,expected_columns:64,log_blocks:originals.size,trunk_columns:new Set([...originals.values()].map(p=>p.x+','+p.z)).size};
 if(c.camp_anchor){const [x,y,z]=c.camp_anchor,r=require('../config/house.json').camp_radius;
  const cleared=[...originals.values()].filter(p=>p.x>=x+1024-r&&p.x<=x+1024+r&&p.z>=z-r&&p.z<=z+r&&p.y>=y-1&&p.y<=y+9).length;
  report.camp_setup={logs_replaced_by_clearing:cleared,starting_logs_after_camp:originals.size-cleared};
  if(fs.existsSync('logs/resource-overhaul-camp-areas.json')){const planned=JSON.parse(fs.readFileSync('logs/resource-overhaul-camp-areas.json','utf8'));const removed=[...originals.values()].filter(p=>planned.areas.some(([a,b,c,d,top])=>p.x>=a+1024&&p.x<=b+1024&&p.z>=c&&p.z<=d&&p.y>=planned.y-1&&p.y<=top)).length;report.proposed_camp={logs_replaced_by_clearing:removed,starting_core_logs_after_camp:originals.size-removed,preserved_extra_logs:cleared-removed};}

 }
 report.success=current.missing_columns.length===0&&columns.size===64;
 }catch(e){report.error=e.stack;}finally{
 await admin({action:'teleport-coordinates',x:-153.5,y:225.1,z:160.5}).catch(()=>{});survey.release(b);
 fs.writeFileSync(process.argv.includes('--overhaul')?'docs/resource-overhaul-census.json':'docs/world-resource-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));b.quit();setTimeout(()=>process.exit(report.success?0:1),300);
 }});
setTimeout(()=>{b.quit();process.exit(1);},90000).unref();

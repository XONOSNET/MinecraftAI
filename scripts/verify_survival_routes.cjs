// Apply the real production preparation commands to an offline Minecraft world.
const fs=require('fs'),{Vec3}=require('vec3'),World=require('prismarine-world')('1.21.4'),Chunk=require('prismarine-chunk')('1.21.4'),data=require('minecraft-data')('1.21.4'),{route}=require('../controller/field_navigation');
const input=JSON.parse(fs.readFileSync('logs/survival-routes-input.json','utf8')),world=new World(null).sync,columns=new Set();
function set(x,y,z,name){const cx=Math.floor(x/16),cz=Math.floor(z/16),key=cx+','+cz;if(!columns.has(key)){world.setColumn(cx,cz,new Chunk());columns.add(key);}world.setBlockStateId(new Vec3(x,y,z),data.blocksByName[name].defaultState);}
for(const command of input.commands){const p=command.split(' ');if(!['fill','setblock'].includes(p[0]))continue;const start=p.slice(1,4).map(Number),end=p[0]==='fill'?p.slice(4,7).map(Number):start,name=p[p[0]==='fill'?7:4].replace('minecraft:','').split('[')[0];for(let x=start[0];x<=end[0];x++)for(let y=start[1];y<=end[1];y++)for(let z=start[2];z<=end[2];z++)set(x,y,z,name);}
// Load adjacent air columns too; unloaded terrain must not hide missing routes.
for(let x=Math.floor(input.bounds[0]/16);x<=Math.floor(input.bounds[1]/16);x++)for(let z=Math.floor(input.bounds[2]/16);z<=Math.floor(input.bounds[3]/16);z++)if(!columns.has(x+','+z))world.setColumn(x,z,new Chunk());
const rows=[];
// Include completed enlarged houses; routes must not depend on empty plots.
for(const p of input.camp.plots){for(const q of require('../controller/house').blueprint(p))set(q.x,q.y,q.z,q.table?'crafting_table':'oak_planks');set(p.x,p.y,p.z-3,'oak_door');set(p.x,p.y+1,p.z-3,'oak_door');}
for(let i=0;i<8;i++){
 const p=input.camp.plots[i],s=input.stations[i],home=[p.x+.5,p.y,p.z-4.5],bot={players:{},entity:{position:new Vec3(...home),onGround:true},blockAt:q=>world.getBlock(q)};
 const down=route(bot,s.bottom,96,8192,false,{bounds:input.bounds,reversible:true});
 bot.entity.position=new Vec3(...s.bottom);const up=route(bot,home,96,8192,false,{bounds:input.bounds,reversible:true});
 bot.entity.position=new Vec3(...home);const animals=route(bot,s.animals,96,8192,false,{bounds:input.bounds,reversible:true});
 rows.push({bot:'LabAI'+i,descend:down.reached,climb_home:up.reached,animal_station:animals.reached,down_waypoints:down.path.length,up_waypoints:up.path.length});
}
const result={fixture:'All eight real prepared stations, Minecraft block shapes, complete reversible routes without natural-terrain shortcuts.',rows,success:rows.every(r=>r.descend&&r.climb_home&&r.animal_station)};
fs.writeFileSync('docs/survival-routes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=result.success?0:1;

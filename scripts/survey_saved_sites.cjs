// Read-only survey of saved region files; no server commands or terrain edits.
const fs=require('fs'),zlib=require('zlib'),nbt=require('prismarine-nbt');
const templates=JSON.parse(fs.readFileSync('data/world-training.json','utf8')).templates;
const regions=new Map();
async function chunk(x,z){
 const file=`server/world/region/r.${Math.floor(x/32)}.${Math.floor(z/32)}.mca`;
 if(!regions.has(file))regions.set(file,fs.existsSync(file)?fs.readFileSync(file):null);
 const b=regions.get(file);if(!b)return null;
 const index=((z%32+32)%32)*32+(x%32+32)%32,at=b.readUIntBE(index*4,3)*4096;
 if(!at)return null;
 const length=b.readUInt32BE(at),type=b[at+4],raw=b.subarray(at+5,at+4+length);
 if(type!==2)throw Error('Unsupported chunk compression '+type);
 return nbt.simplify((await nbt.parse(zlib.inflateSync(raw))).parsed);
}
(async()=>{
 const results=[];
 for(let site=0;site<9;site++){
  const x=16384+site*4096,z=16384,saved=templates[`${site}-128`],shift=saved?1024:0;
  const r={scenario:site,site:site+1,saved:!!saved,loaded_chunks:0,log_blocks:0,tree_columns:0,wooded_chunks:0,water_columns:0,biomes:{}};
  for(let cx=x/16;cx<(x+128)/16;cx++)for(let cz=z/16;cz<(z+128)/16;cz++){
   const c=await chunk(cx+shift/16,cz);if(!c)continue;r.loaded_chunks++;
   const trees=new Set(),water=new Set();let logs=0;
   for(const s of c.sections||[]){
    if(s.Y<3||s.Y>11)continue;
    for(const biome of s.biomes?.palette||[])r.biomes[biome]=(r.biomes[biome]||0)+1;
    const bs=s.block_states;if(!bs)continue;
    const logIds=new Set(),waterIds=new Set();
    bs.palette.forEach((p,i)=>{if(/:(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_log$/.test(p.Name))logIds.add(i);if(p.Name==='minecraft:water')waterIds.add(i);});
    if(!logIds.size&&!waterIds.size)continue;
    const bits=Math.max(4,Math.ceil(Math.log2(bs.palette.length))),per=Math.floor(64/bits),mask=(1n<<BigInt(bits))-1n;
    for(let i=0;i<4096;i++){
     const pair=bs.data?.[Math.floor(i/per)];
     const value=pair?(BigInt(pair[0]>>>0)<<32n)|BigInt(pair[1]>>>0):0n;
     const id=Number((value>>BigInt((i%per)*bits))&mask),column=i%256;
     if(logIds.has(id)){logs++;trees.add(column);}if(waterIds.has(id))water.add(column);
    }
   }
   r.log_blocks+=logs;r.tree_columns+=trees.size;r.water_columns+=water.size;if(trees.size)r.wooded_chunks++;
  }
  results.push(r);console.log(JSON.stringify(r));regions.clear();
 }
 fs.writeFileSync('logs/site-resource-survey.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

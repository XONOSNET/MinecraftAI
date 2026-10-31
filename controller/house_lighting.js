// Use a specific vertical support face: generic placement prefers the floor.
const house=require('./house'),inventory=require('./inventory_sync');
function installed(bot,plot,side){const mount=house.torchMount(plot,side),block=bot.blockAt(mount.position);return block?.name==='wall_torch'&&block.getProperties().facing===mount.facing;}
function missing(bot,plot){return ['indoor','outdoor'].filter(side=>!installed(bot,plot,side)).length;}
async function place(bot,plot,side,teacher=null){
 if(installed(bot,plot,side))return;
 const mount=house.torchMount(plot,side),support=bot.blockAt(mount.support);let occupied=bot.blockAt(mount.position);
 if(support?.boundingBox!=='block')throw Error(side+' torch needs its house wall');
 if(occupied?.boundingBox!=='empty'&&occupied&&teacher?.plot===plot){
  await require('./construction_clearance').clear(teacher,bot,occupied,{lighting:side==='outdoor'});
  occupied=bot.blockAt(mount.position);
 }
 if(!occupied||occupied.boundingBox!=='empty')throw Error(side+' torch position is obstructed');
 await inventory.sync(bot);await inventory.equip(bot,'torch');await bot.placeBlock(support,mount.face);
 if(!installed(bot,plot,side))throw Error(side+' wall torch placement did not verify');
}
module.exports={installed,missing,place};

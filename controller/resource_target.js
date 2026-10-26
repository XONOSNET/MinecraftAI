const RANGE=4.2;
function withinReach(bot,position,standing=bot.entity.position){
 const eye=standing.offset(0,bot.entity.eyeHeight||1.62,0);
 return position.offset(.5,.5,.5).distanceTo(eye)<=RANGE;
}
function harvestable(bot,position){
 const block=bot.blockAt(position);
 return !!block&&withinReach(bot,position)&&bot.canDigBlock(block)&&require('./target_scan').visibleBlock(bot,block);
}
module.exports={withinReach,harvestable};

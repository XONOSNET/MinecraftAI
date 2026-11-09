// Recenter on checked footing before crossing a jagged bank corner.
const {proximity}=require('./perception');
const water=require('./water_navigation'),space=require('./resource_space');
function alignmentCue(bot,cue){
 const p=bot.entity.position;
 if(!cue||bot.entity.onGround!==true||bot.entity.isInWater||bot.entity.isInLava||Math.abs(p.y-Math.round(p.y))>.05)return null;
 const dx=cue[0]-p.x,dz=cue[2]-p.z,d=Math.hypot(dx,dz),rise=cue[1]-p.y;
 if(d<.3||d>2.2||rise> .4||rise< -1.2||Math.floor(cue[0])===Math.floor(p.x)&&Math.floor(cue[2])===Math.floor(p.z))return null;
 const sensed=proximity(bot,{recovery:false}),heading=Math.atan2(-dx,-dz),distance=Math.min(.75,d);
 if((rise<-.6?sensed.canStepDown:sensed.canWalk)(heading,distance))return null;
 const center=[Math.floor(p.x)+.5,Math.round(p.y)+.1,Math.floor(p.z)+.5],cx=center[0]-p.x,cz=center[2]-p.z,cd=Math.hypot(cx,cz);
 if(cd<.18||water.cell(bot,Math.floor(p.x),Math.round(p.y),Math.floor(p.z))?.wet!==false||!space.clearOfPlayers(bot,{x:center[0],y:center[1],z:center[2]}))return null;
 if(!sensed.canWalk(Math.atan2(-cx,-cz),cd))return null;
 center.centering=true;return center;
}
module.exports={alignmentCue};

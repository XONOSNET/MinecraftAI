// Only spectator surveys may suspend gravity. Survival setup uses the server's
// slow-falling effect and normal physics until a checked ground spawn is ready.
function hold(bot){
 if(!['spectator',3].includes(bot.game?.gameMode)){release(bot);return;}
 if(!bot.physics)return;
 if(bot.labSurveyGravity===undefined)bot.labSurveyGravity=bot.physics.gravity;
 bot.physics.gravity=0;
 if(bot.entity?.velocity){bot.entity.velocity.x=0;bot.entity.velocity.y=0;bot.entity.velocity.z=0;}
}
function release(bot){if(bot.labSurveyGravity!==undefined){if(bot.physics)bot.physics.gravity=bot.labSurveyGravity;delete bot.labSurveyGravity;}}
module.exports={hold,release};

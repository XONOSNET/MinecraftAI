// Preserve held movement across identical policy decisions. Turns still stop forward motion.
function applyMotion(bot,action,permissions){
 const forward=!!permissions.move&&(action===0||(action===3&&!!permissions.jump));
 const jump=forward&&action===3;
 for(const [control,wanted] of [['forward',forward],['jump',jump]])
  if(bot.getControlState(control)!==wanted)bot.setControlState(control,wanted);
}
module.exports={applyMotion};

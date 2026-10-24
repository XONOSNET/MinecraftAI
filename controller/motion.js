// Preserve held movement across identical policy decisions. Turns still stop forward motion.
function applyMotion(bot,action,permissions,task=null){
 if(bot.getControlState('sprint'))bot.setControlState('sprint',false);
 const forward=!!permissions.move&&(action===0||(action===3&&!!permissions.jump));
 const vertical=task?.kind==='expedition'&&permissions.jump;
 const jump=(forward&&action===3)||!!vertical&&(action===5||[1,2].includes(action)&&!!bot.entity?.isInWater);
 for(const [control,wanted] of [['forward',forward],['jump',jump],['sneak',!!vertical&&action===6]])
  if(!!bot.getControlState(control)!==wanted)bot.setControlState(control,wanted);
}
function pauseMotion(bot,permissions){applyMotion(bot,bot.entity?.isInWater?5:4,permissions,{kind:'expedition'});}
module.exports={applyMotion,pauseMotion};

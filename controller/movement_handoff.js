// Ordinary work yields to a short checked jump; emergency planners may preempt.
function hold(t,motor,{urgent=false}={}){
 if(!motor.committedJump?.())return false;
 const metrics=t.movementHandoffs??={deferred_updates:0,urgent_updates:0};
 if(urgent){metrics.urgent_updates++;return false;}
 metrics.deferred_updates++;t.message='Completing the checked jump before resuming '+t.phase;return true;
}
module.exports={hold};

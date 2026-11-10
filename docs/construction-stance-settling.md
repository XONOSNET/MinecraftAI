# Settle before spending construction retries

Failed wall placements in trials 754 and 770 followed route arrival while the
bot still had horizontal velocity around 0.12 blocks per tick. Native read-only
inspection of trial 770 found reachable visible alternatives, while the failed
stance itself was occluded. Movement between selecting a face and sending the
placement packet can invalidate that face.

Wall and roof construction now pauses and waits for grounded status and
horizontal speed at or below 0.025 before selecting and placing another block.
This uses the same stillness threshold already enforced for station placement.
Waiting does not spend a face or stance retry, reset the progress timestamp,
advance a milestone, add materials or extend the trial deadline. Existing
danger interruptions and construction timeouts still apply.

A controller transition regression completes an approach with residual
velocity, verifies no placement or retry is consumed, then verifies airborne
waiting, stable placement and progression to the door phase after actual
blueprint completion. It does not establish that all rejected placement angles
are fixed; sightline selection and bounded retry exhaustion remain separate
possible causes. Survival improvement must be measured after deployment.

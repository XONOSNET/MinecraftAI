# Exit recorded mine stairs before seeking night cover

In candidate trial 680, LabAI1 stopped after ninety stationary seconds in
`night_seek_cover`. Its last navigation report was a valid upward mine step at
Y58. Cover search samples local destinations with at most three blocks of
height difference, while the recorded mine entrance was at Y64. It could fail
to find a refuge destination and pause instead of continuing the mine exit.

A read-only inspection found the step supported and the route reachable. A
separate diagnostic account climbed that exact step with the existing motor:
forward and jump were both held at takeoff, peak feet height was Y59.2 and it
landed on the Y59 stair. No blocks were changed and no supplies were granted;
the diagnostic disconnected afterward. Local evidence is retained in
`logs/opal-mine-inspection.json`.

The survival planner now hands underground cover requests to the recorded mine
exit before trying general earth-cover search. It reuses the existing sensed
stair routing, changed-footing checks and committed-jump handling. The exit
cursor persists if daylight arrives; the original lesson remains resumable.
Surface requests and ordinary mining retain their behavior. No resources or
milestones are awarded by this handoff.

All 669 JavaScript tests passed, including underground interruption, stair-by-
stair return, daylight during the exit, preserved inventory/milestones and an
airborne committed jump. Completion-rate effects still need full comparisons.

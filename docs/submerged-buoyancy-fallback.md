# Preserve submerged buoyancy at flowing-water boundaries

BirchToad stopped without progress at nearly the same underground water position
in trials 717 and 722. The trial 717 record showed a submerged air-escape state,
no complete escape path, and `in_water: false`. Read-only native inspection at
[24657.733,40.325,16516.818] found falling water through the body and eye cells.
The bounded air planner rejects that current, as intended.

When no complete air route existed, the old fallback delegated to surface water
movement. With its physics water flag false and no valid surface cell, both
forward and jump controls were false. A read-only replay against actual loaded
blocks reproduced this output. The revised submerged fallback keeps jump true
when the sensed eye cell is water, even if the physics flag briefly says false.
It requests no horizontal displacement and continues bounded air-route searches.

Horizontal movement still requires the existing collision, player, current,
private-plot and reachability checks. This grants neither an unchecked route
through falling water nor success credit. Buoyancy respects jump permissions
and releases once both the physics flag and sensed eye water are clear.

The regression exercises the no-route transition, incorrect physics flag,
current rejection, buoyancy control, disabled jump permission, and return to
breathable space without completing the interrupted gathering task. All 692
JavaScript tests pass. The native check validates control output against the
recorded geometry; it does not establish that the bot can escape every waterfall.
Further survival evaluation is required after deployment.

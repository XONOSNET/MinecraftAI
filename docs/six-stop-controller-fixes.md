# Night 3 six-stop review

The inspected baseline had three actual deaths, one failed emergency cover
placement, one ineffective stationary combat engagement, and one house-exit
stall. Death remains a real failure; this change does not revive stopped bots
or award completion.

Read-only inspection of SolarSwift's doorway found an open west-facing birch
door in a north/south house entrance. Its opened panel spanned the passage and
the doorway controller could not identify the intended crossing. The general
placement helper aimed at a support after choosing the door orientation, thereby
changing the yaw used by Minecraft. Door placement now restores north-facing
yaw immediately before sending the native placement packet. The isolated native
house-repair fixture verifies this actual server-side facing.

Emergency covers now recheck authoritative inventory, dry support, occupancy,
headroom and grounding, then retry three different face hit heights after an
explicit server refusal. A block must physically appear before the stage can
advance. The existing 30-second physical-progress guard remains unchanged; retry
attempts are not progress. Reports expose the refusal count. Unsupported ground,
fluids, occupied cells and missing server answers are not bypassed.

Combat engagements that neither close distance nor reduce observed enemy health
for twelve seconds yield to route/cover reassessment. The particular enemy is
deferred for fifteen seconds, not ignored permanently. Threat assessment still
sees it and can demand escape. No hit or lesson credit is manufactured by yielding.

A surviving bot also waited in recovery at 16 health and 12 hunger without food
or an axe. That cannot regenerate health naturally. When daylight and threat
assessment permit, recovery now resumes its interrupted supply lesson to obtain
its hunting tool; bots with an axe retain the existing emergency food trip.
Night-time cover still takes priority. No materials or food are granted.

All 475 JavaScript checks passed. Unit regressions cover placement yaw, refused
cover retries and blockers, bounded ineffective combat, confirmed enemy damage,
and the no-food/no-tool recovery deadlock. Native fixtures use isolated terrain
and diagnostic inventories, not production grants or production success scores.

The native door fixture repaired its damaged house in 8.78 seconds and confirmed
north-facing placement at full health. The burrow fixture sealed in 3.11 seconds
and exited in 13.43 seconds including diagnostic commands, retaining its starting
six health points. Both cleaned their fixture terrain and temporary permissions.

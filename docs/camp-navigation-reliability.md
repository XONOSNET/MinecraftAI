# Shared-camp navigation reliability

The previous supported First Night teacher completed for only 2 of 8 bots (trial 361). That is a controller failure, not evidence that the student should simply train longer. `night_hold` is the final sheltered survival watch; supported level 0 requires 180 seconds there.

## Changes

- Camp paths reserve each house footprint, including unfinished houses. Outdoor trips route around private rooms rather than treating an open neighboring door as a shortcut. A bot already inside a neighboring room commits to that room's exit before resuming its destination.
- Door opening and doorway crossing use the room being exited. A valid route is retained while progress continues; terrain changes, departure from the route and stalls still trigger replanning.
- First Night combat honors the chosen entity and, in supported lessons, its owner label. A closer neighboring sheep or cow cannot silently replace the selected animal.
- Crafting returns ingredients and outputs to compatible partial stacks before empty slots. Repeated log conversion no longer consumes one new inventory slot per recipe execution.
- Remembered resource blocks are converted to walkable approach cells. Exploration reserves budget for new terrain rather than filling its entire candidate list with solid trunks from previous trials. Finding resources clears the unavailable-resource timer.
- A depleted-tree lock now waits only for pickup-eligible wood drops. Drops above pickup height or already rejected drops cannot prevent switching to a fresh tree. The shared run exposed this separately: one bot held an old tree until the stranded drop despawned, then immediately resumed harvesting. This correction is covered before loading it for the next automatic cycle; its full-controller regression tests preserve nearby collectible-drop behavior.
- Precise alignment brakes residual forward velocity instead of overshooting a cell center and reversing. Navigation also acknowledges a centering waypoint crossed between decisions, while retaining the ground/height checks. The precision safety probe stops at the near alignment target instead of rejecting a wall beyond the upcoming turn. The native corner reproduction checks the actual applied teleport position before moving; it reached home in 4.4 seconds.

## Verification

Eleven targeted regressions cover private-room avoidance, a committed foreign-room exit, route retention, ownership-preserving combat selection, stale resource landmarks, and collectible/high/ignored wood drops. The complete JavaScript suite passes (193 tests).

Live-server inventory and eight-bot teacher verification are recorded separately. These controller checks do not establish autonomous wilderness competence, and the supported lesson still uses prepared resources, scripted recipes/construction and route planning.

Live inventory verification passed: 40 logs produced 160 planks in three inventory stacks, and door crafting succeeded with room remaining. The first shared-camp diagnostic exposed the stale-landmark search failure in one bot; that run was stopped to load the correction for all eight bots.

A native server route regression also passed: starting inside a neighboring closed house, the teacher opened and exited that room, routed to its owned house, opened its closed door and arrived inside in 8.2 seconds. Fixture grants are documented in `first-night-camp-route-native.json`; this is a geometry/controller check, separate from the production group run. Controller reconnect readiness now tolerates a busy dashboard response instead of abandoning connection attempts after two seconds.

The second eight-bot diagnostic was interrupted to deploy the final precision-movement and depleted-tree fixes. Its exact intermediate outcomes are saved in `first-night-camp-native.json`, explicitly marked as an incomplete qualification. Three bots stopped before those final fixes were loaded; one reached the final shelter watch, and the others were still working. No full eight-bot pass is claimed. Native reproductions subsequently passed for the house corner (4.4 s), the stalled pickup geometry (4.4 s), and the short alignment beside a wall (1.2 s). Automatic protected First Night learning is resumed with the complete controller patch.


## Follow-up: four stopped student baseline bots

`world-1793134362275407500` was a student baseline. LabAI0 and LabAI3 stopped on early workbench placement refusals; the accepted approach radius could overlap the new block, and residual movement was not checked. The approach is now farther from the table with a narrower radius, waits for horizontal motion to settle, and rechecks position after log crafting. Grounded Mineflayer players still report gravity in vertical velocity, so the rest check uses horizontal velocity and grounded state. Native recovery from the unsafe old stance successfully crafted the table and axe in 7.8 seconds.

LabAI5 waited inside an unfinished neighboring plot. An absent door was incorrectly treated as closed, so it kept reaching the inner approach without an interaction that could release it. Empty doorways now proceed outside; native recovery reached its owned home in 6.8 seconds.

LabAI1 had a 90-second route-progress timeout. The original report cannot distinguish policy failure, player avoidance or a safety hold conclusively. New navigation reports preserve motor state and held controls, nearby player positions and clearance, raw obstacle flags and short/long ground probes. This timeout is not claimed fixed or forced into a passing result.

All 198 JavaScript tests pass. Exact stop reports and validation limits are in `stopped-baseline-investigation.json`. The automatic comparison restarts with unchanged protected model weights and identical new controller code on both sides; an evaluation begun under older controller code is not used to promote weights.

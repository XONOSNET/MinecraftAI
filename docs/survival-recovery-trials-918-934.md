# Burrow and home-return survival reproductions

Trials 918 and 919 finished with 5 of 8 and 4 of 8 bots respectively. Trial 924 was a teacher run with 7 of 8 finished. Teacher trial 934 finished with 2 of 8. These are observations from real trials whose layouts, policies, and encounters vary.

| Trial and bot | Observed stop | Evidence saved at the stop |
| --- | --- | --- |
| 934 LabAI3 | `night_burrow`, 30 seconds without progress | Grounded and centered at y62, dry dirt floor, air at body, head and shaft mouth, 2 dirt left. |
| 924 LabAI6 | `night_burrow`, 30 seconds without progress | Grounded and centered at y69, dry dirt floor, air at body, head and shaft mouth, 59 dirt left. |
| 934 LabAI2 | `night_burrow`, 30 seconds without progress | `seal` after two confirmed shell repairs. Zero dirt left. The roof and the position of its previously placed supporting lip were both open. |
| 918 LabAI2 and 919 LabAI1 | `light_return`, 60 seconds without progress | Routes were still recorded and approached the entry. The last movement snapshots were near the doorway. |

The climb and sealing stops ran controller `a0d043041e461ac2`. The home-return stops ran `55a31bdea55a3825`. A final stop sample gives positions and state, with no packet history for the failed climb or final motor commands during the full doorway wait. The reproductions exercise conditions that can produce the observed failure mode.

## Two-block climb

On separate Paper 1.21.4, the old controller climbed both clean replays from the recorded relative stances and inventories in under two seconds. Injecting an eight-physics-tick delay in the second aim reproduced a stall with the full 2 or 59 dirt still carried. Both jumps peaked 1.252 blocks above the floor. The queued placement reached Paper after the bot dropped below the target and started a second hop at +0.420. Paper confirmed the cell was still air, and the bots landed back at the bottom.

Commit `23c0e82` aims while grounded, pulses one jump, places at the first checked clearance tick, and requires a server-confirmed block and grounded landing in the same column before reporting progress. The two clean replays passed in 1.907 and 1.849 seconds. With the same late-aim injection and a real carried-light block inserted after the first step, both replays still passed in 2.037 and 1.913 seconds. Each placed and consumed exactly two dirt, reached the original surface, and resumed `gather` with no added milestone. The historical reports cannot establish that the live controller hit the reproduced timing race.

```powershell
node --test tests/resource-access.test.js tests/escape-column.test.js tests/emergency-burrow.test.js
node scripts/verify_emergency_burrow_climb_native.cjs
node scripts/verify_emergency_burrow_climb_native.cjs --late-look
node scripts/verify_emergency_burrow_climb_native.cjs --late-look --carried-light
```

The native replay expects disposable loopback Paper on game port 25571 and RCON port 25572, with its own properties under `logs/survival-paper-fixture`. It verifies each test volume starts empty, removes the blocks and items on exit, and disconnects its fixture bot. The raw runs are under `logs/shaft-climb-*.jsonl`.

## Sealing after two shell repairs

The isolated survival replay started with an empty inventory. It collected dirt from excavation and checked side pockets, then repaired both introduced wall breaks. Paper confirmed both patches. The bot had zero dirt at y61 and both roof cells were open. The old controller waited for a roof pickup while the lip was also missing and stopped at its existing deadline after 30.044 seconds.

Commit `4245d58` recovers a lost supporting lip before checking whether enough dirt is carried for the roof. From the checked bottom stance, the bot can dig one closed side pocket per missing cover part. It rechecks reach, visibility, neighboring blocks, water, and clear footing immediately before digging. In Paper, the candidate mined two distinct pockets, sealed in 7.039 seconds, then reclaimed the real cover blocks and climbed out in 4.209 seconds. It landed grounded at y63 with 20 health and resumed `gather` with no added milestone. The regression also rules out credit or mining when a pocket opens to water during aim.

```powershell
node --test --test-name-pattern 'two shell patches|cover material recovery' tests/emergency-burrow.test.js
node logs/trial-934-shell-native.cjs --baseline
node logs/trial-934-shell-native.cjs
```

The local native harness uses the same disposable Paper instance and loads the previous controller from an archived source copy for `--baseline`. Both arms verified fixture cleanup and disconnection. Raw evidence is in `logs/trial-934-shell-native-before.json` and `logs/trial-934-shell-native-after.json`.

## Returning after lighting both wall torches

The recorded navigation snapshots showed complete, dry routes with no nearby player or blocked crossing. Read-only inspection found both huts still present with both wall torches, a north-facing wooden door, and a one-block descent from the yard. Replaying the saved outside positions through the previous controller could cross the doorway. The reports do not capture the final stance throughout the stall.

The reproducible stop began 0.52 blocks past the open door plane. The bot had entered the house bounds and still occupied the closing area. Early lighting asked to close the door and consumed the tick, so the occupancy check kept the door open and the controller sent zero movement commands despite valid four-waypoint routes. On isolated Paper both old-controller bots failed at the original deadline after 60.029 and 60.004 seconds.

Commit `718608b` walks to the checked interior stance before attempting to close the door. The existing occupancy and closure checks still apply. The two threshold replays closed their real doors and reached the `leave_hut` handoff after 0.796 and 0.792 seconds, then resumed `gather` after 3.882 and 6.405 seconds. Four further replays from the recorded positions and raised yards reached `gather` on both geometries. All six kept 20 health, both verified torches, and their starting milestones. The focused regression also checks that a different player in the doorway prevents closure.

```powershell
node --test --test-name-pattern 'occupied threshold' tests/prebuild-lighting.test.js
node logs/export-light-return-region.cjs
node logs/replay-light-return-paper.cjs
node --test tests/*.test.js
```

The local native scripts translated the observed geometry onto disposable Paper. The raw trace is `logs/light-return-paper-result.json`. The fixture cleared the two hut volumes and released their force-loaded chunks. The isolated Paper process was then stopped, its two loopback listeners closed, and the disposable files removed. All 767 JavaScript tests passed in the combined suite.

## Live rollout on November 15, 2026

Comparison 445 finished on the previous controller. It retained the candidate after 6 of 8 finished against 3 of 8 for the saved baseline. The only deployment worker waited for that decision and a clear restore status. It paused comparison 446 during terrain restoration, restarted only the bot controller, verified the active and protected checkpoint hashes, and resumed automatic learning with the same options.

By 19:05 CST the dashboard responded, Paper remained ready on PID 36160, and all eight fresh bots reported controller `4d58dc099d8c9a13` in the running baseline of comparison 447 (`world-1794790693338912800`). The current trial remains First Night on site 3 with support level 3. Track future teacher and student stops for climb with dirt on hand, sealing after repairs, and `light_return`, alongside deaths and lesson completion. Count how many bots reached those phases when the reports provide that evidence. The rollout verifies the new code is running. Completed trials under this revision are needed to assess live effects.

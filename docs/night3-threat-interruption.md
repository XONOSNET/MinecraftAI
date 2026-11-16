# Night 3 threat interruption and recovery

## Pre-deployment evidence

I audited completed First Night trials at site 3 and support level 3 on controller `4d58dc099d8c9a13` and behavior revision `6ce78e920274`. The starting window had two completed runs. Trial 942 was comparison 447's student baseline (`world-1794790693338912800`) with 4 of 8 complete. Trial 943 was its teacher practice (`world-1794794643973818200`) with 2 of 8 complete. The current round 448 baseline was still running at the audit. These outcomes describe one natural site and a small, correlated roster. The teacher and student runs had different encounters.

| Rank | Terminal outcome | Student 942 | Teacher 943 | Total |
| --- | --- | --- | --- | --- |
| 1 (tie) | Death | 0 | 4 | 4 |
| 1 (tie) | Global trial deadline | 4 | 0 | 4 |
| 3 (tie) | Sealing aborted on airborne headroom check | 0 | 1 | 1 |
| 3 (tie) | Furnace workstation change exhausted retries | 0 | 1 | 1 |

| Point in recovery | Ended attempts | What the record establishes |
| --- | ---: | --- |
| Reaching cover or excavating it | 2 deaths | In 943, LabAI5 died from a skeleton in `night_seek_cover` after eight searches. Its recorded fatal position was inside the hut's geometric bounds, with no proof the enclosure was secure. LabAI3 died from a zombie while digging an open shaft, one block below the surface. |
| Sealing or waiting in shelter | 4 stops | In 943, LabAI1 was airborne at `seal`, 0.575 blocks above the shaft floor, with an intact lip, one dirt, and the roof open. In 942, LabAI2 ran out of time while waiting for daylight in a hidden burrow. LabAI3 and LabAI6 had finished scouting and exhausted the watch, but failed to verify morning by the trial deadline. |
| Leaving cover or resuming work | 4 stops | In 943, LabAI2 died at the shaft mouth during `climb` with eight dirt. LabAI0 died from a skeleton almost 15 blocks outside its hut while in `night_recover`. Its path to that location was not recorded. LabAI6 stopped in `smelt` after creeper damage and repeated furnace workstation errors. In 942, LabAI1 was at full health when its recovery reached the trial deadline. |

No death was confirmed inside a closed shelter. The four death rows omitted the executable revision because the controller's immediate death report carries no timing fields. The other rows from the same trial report `4d58dc099d8c9a13`, the revision verified for that deployment. The last encounter records give the bots' positions before death. The Paper death log confirms the hostile types.

The earlier exact stop signatures each had zero recurrences. At least 12 of 16 attempts entered burrow work, including the two un-timed burrow deaths. The report has no count of every climb or shell repair. The creeper death at the shaft mouth showed that the bot had reached surface height, while the earlier climb defect left it at the bottom. The new roof error occurred with dirt and no shell repairs. Ten directly timed `light_return` runs took 2.0–17.9 seconds and continued to chest work. Two other bots had already passed lighting and chest work before their death; neither logged a timed `light_return` row. No bot ended on the old 60-second return stall.

The source for completion counts is `data/world-training.json` through `scripts.analyze_world_reliability.recent_runs`. Detailed audit rows are preserved locally in `logs/night3-threat-recovery-inputs.json`. Later comparable completed trials will be reported with the revision they ran.

The audit also identified a separate workstation path. A missing furnace can produce `BUILD_STATION_CHANGED` in early lighting before the existing home-repair handler receives the tick. That path merits its own reproduction. The two fixes in this rollout target the verified physical recovery cases. The audit supplies no evidence that the two morning-verification deadlines share either of those defects.

## Roof sealing after a hit

Trial 943 LabAI1 was airborne in a checked dry shaft with one dirt, the lip placed, and the roof open. The archived controller stopped immediately because the roof guard required grounded footing on that tick. Commit `196094d` holds position while a centered bot settles into a verified dry shaft. The normal checks for threats in the opening, footing, headroom, player clearance, and actual roof placement still apply. Waiting grants no progress and keeps the 30-second deadline.

An isolated Paper 1.21.4 fixture started with an empty inventory and ran the real shaft dig and lip placement. Calibrated Paper damage reproduced the airborne stance at +0.548 blocks, compared with +0.575 in the stop report. The fixture was descending and the historical bot was rising. The original cause of the live motion is uncertain. The archived `4d58dc099d8c9a13` controller ended the trial on that tick with the dirt unspent and cap still open. The candidate held the dirt until grounded, sealed in 249 milliseconds, climbed out on two confirmed dirt steps in 4.126 seconds, resumed `gather`, and harvested a native oak log at 20 health. It gained no milestone from recovery. Both arms cleared their fixture volume and disconnected.

```powershell
node --test --test-name-pattern 'verified dry shaft lands|seal settling check' tests/emergency-burrow.test.js
node scripts/verify_emergency_burrow_seal_native.cjs logs/fixture-airborne-baseline/controller --expect-headroom-stop
node scripts/verify_emergency_burrow_seal_native.cjs
```

The native commands use a separate loopback Paper on game port 25571 and RCON port 25572. Raw results are `logs/trial-943-seal-native-before.jsonl` and `logs/trial-943-seal-native-after.jsonl`.

## Displaced during hut recovery

Trial 943 LabAI0's recorded fatal position was 14.8 blocks outside its hut in `night_recover`. The controller assumed it was still inside. That phase paused the motor and could ask to close the door from out of reach. Commit `6d5b379` sends an exposed recovery bot back through its checked retreat, keeping the interrupted task and the existing progress clock. During an earlier candidate replay, the route finder saw no grounded origin mid-jump and diverted the bot away from the refuge. The fix lets a committed jump on a complete retreat route finish when the only route blocker is airborne footing. An unsafe or occupied home, close attacker, or critical health still preempts the wait. The route is checked again after landing.

The isolated fixture translated the recorded relative position into a controlled one-step approach with a real closed-shell hut and open door. It used the same 10-health survival start and ordinary attacking skeleton for both arms. The archived controller issued zero movement commands and took five skeleton hits, dying after 6.987 seconds. The candidate followed the native route, verified the door closed in 7.543 seconds, and returned to `night_recover`. After native regeneration brought health to 18 it resumed `night_food` at 12.182 seconds. The fixture then removed its tagged skeleton, and the bot executed the food lesson's checked walk back to the yard. It reached the yard at full health, with the door closed again and the original milestone list intact. This reproduces the missing recovery action from the recorded exterior state. The historical movement into that state remains unknown.

```powershell
node --test tests/shelter-policy.test.js tests/survival-defense.test.js tests/prebuild-lighting.test.js tests/world-navigation.test.js
node logs/trial-943-cover-native.cjs --baseline
node logs/trial-943-cover-native.cjs
node --test tests/*.test.js
```

Raw results are `logs/trial-943-cover-native-before.jsonl` and `logs/trial-943-cover-native-after.jsonl`. Both native fixtures verified cleanup and disconnection. The loopback Paper process was stopped, its listeners closed, and the disposable server files removed. The combined JavaScript suite passed all 771 tests.

## Additional runs before the rollout

Comparison 448's baseline trial 944 (`world-1794796893536242000`) finished 6 of 8. LabAI3 died to a creeper during `night_retreat`. LabAI2 stopped while trying to reach its plot-clearing work. Teacher trial 945 (`world-1794800336079100300`) finished 5 of 8. LabAI7 died to a skeleton during burrow `approach`, LabAI5 found no safe route to begin clearing its plot, and LabAI1 stopped in `return_home` after 60 seconds. These runs used the old `4d58dc099d8c9a13` controller at the same site and support level. The `return_home` stop is a separate lesson phase from the earlier `light_return` issue.

Through trial 945 the pre-rollout count was 17 of 32 complete. Deaths ended six attempts, whole-trial deadlines ended four, plot-clearing navigation ended two, and the ordinary home return, airborne seal guard, and furnace each ended one. Of the six deaths, four occurred during travel to cover or open excavation, one at a shaft exit, and one during displaced recovery. The distinct enemy types and terminal phases leave the cause of the travel-to-cover deaths open.

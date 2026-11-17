# Night 3 teacher survival on site 1

Comparison 466 used the 128-block Natural settlement site at Night 3, with a day-zero start, behavior revision `6ce78e920274`, and controller `152d06211ed509f5`. Saved student trial 979 completed 5 of 8 attempts. Teacher trial 980 completed 2 of 8. Candidate student trial 981 completed 7 of 8 and was retained. The student and teacher encountered different mobs and made different movements.

| Comparison | Teacher trial | Completed | Died en route to cover | Died digging or sealing | Died on exit | Nonfatal climb stalls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 459 | 963 | 4/8 | 2 | 0 | 0 | 0 |
| 460 | 966 | 4/8 | 1 | 0 | 0 | 0 |
| 466 | 980 | 2/8 | 3 | 1 | 1 | 1 |
| 467 | 983 | 4/8 | 3 | 1 | 0 | 0 |
| Total | | 14/32 | 9 | 2 | 1 | 1 |

This baseline includes the four latest comparable completed teachers available at the start of the investigation. Count travel deaths from `wilderness.death.phase` in `night_retreat`, `night_seek_cover`, or a `night_burrow` death at `approach`. Dig and seal deaths bring the total before verified cover to 11. An exit death and a nonfatal climb stall are separate outcomes. The climb stall requires a `climb` stage and the 30-second no-physical-progress stop. Instant death reports may omit executable revision. Their run peers all reported the deployed revision. The records do not count every refuge approach or climb in successful attempts.

Read archived sessions with `scripts.analyze_world_reliability.recent_runs('data/world-training.json', 30)`. Filter for `phase=finished`, `driver=teacher`, `mission=first_night`, `night_level=3`, `scenario=0`, `size=128`, `layout=0`, `start_time_of_day=0`, and the behavior revision above. Compare under the same criteria after rollout. Production advanced past site 1 after comparison 467. Site 2 failed its resource survey, so comparison 469 began on site 3. Post-rollout site 1 evidence depends on the ordinary curriculum returning there.

## LabAI5's climb

LabAI5's terminal report placed it at `[16434.3, 62, 16457.472037560015]`, grounded with two dirt blocks in a dry shaft with an open mouth at y64. The previous jump-placement fix was already running. The terminal snapshot has no jump trajectory, placement packets, or Paper confirmation history. Student trial 972 LabAI4 also reached the same timeout on the deployed controller with 55 dirt and a centered stance one block below the surface.

The isolated Paper 1.21.4 replay used LabAI5's exact terminal coordinates, velocity, two dirt, and shaft depth. Both jumps peaked 1.252 blocks above their starting floors. Each sent its placement after a position packet at +1.166 blocks. Paper confirmed both dirt blocks and returned no position corrections. The bot landed grounded at y63 and y64, used exactly two dirt, and resumed `gather` in 1.664 seconds. The replay establishes that the recorded pose and materials can climb with the deployed controller. The live stall cause remains unresolved.

```powershell
node scripts/verify_emergency_burrow_climb_native.cjs 980
```

The climb failure report now keeps the last attempt and any current wait reason. It records blocked preconditions, the sampled peak, the placement request pose, the block state after the server's reply, and the final grounded pose. A runtime failure can now distinguish a jump that never reached clearance, a refused or unanswered placement, and a failed landing. Details are attached to the existing burrow failure context. The original timeout and verified inventory and landing checks still apply.

Raw evidence is in `logs/trial-980-shaft-edge-before.jsonl`. The replay cleared the shaft, disconnected, and closed both loopback fixture ports.

## Approaching an unsafe excavation target

Paper recorded zombie deaths for LabAI2 and LabAI6 in trial 980, at 04:06:35 and 04:08:05 CST. Their last reported targets were `[16486, 63, 16421]` and `[16470, 63, 16445]`, both still in burrow `approach`. LabAI2 had earlier phantom damage. LabAI6 had substantial skeleton damage and died in another zombie approach in trial 983. The immediate death reports lack the final movement and the pursuer's position, so the exact path to each death is unknown.

The prior urgent fallback's proximity filter admitted patches as close as 1.5 blocks from a zombie, subject to its separate route checks. The unopened-shaft check would abandon excavation within 3.5 blocks. The controller also continued toward a previously clear patch as a visible pursuer entered that range. The revised approach uses the existing digging limits at selection and during travel, including the 4.5-block creeper limit. It releases the claim and returns to checked cover search with the interrupted lesson saved. An airborne checked jump keeps its existing movement and route checks. The ordinary threat, footing, inventory, and shelter verification gates still apply.

The focused regression places two valid earth patches on opposite sides of a survival start. It verifies rejection of the close patch, retargeting when a visible zombie closes on an existing approach, and handoff after a checked landing. The prior code fails those regressions. All 118 focused checks and the 787-test JavaScript suite pass with the climb diagnostics and approach fix together.

```powershell
node --test tests/burrow-dangerous-approach.test.js tests/emergency-burrow.test.js tests/resource-access.test.js tests/refuge-choice.test.js tests/first-night.test.js tests/survival-progression.test.js
```

The first native pursuit attempt stopped before release in both arms on frozen-start verification. Both fixture volumes were cleared and both bots disconnected. Its two `logs/trial-980-cover-native-*-unreleased.json` files contain setup records only.

The corrected disposable launcher enables command-spawned monsters and the arena script disables natural spawning. The runner verifies the frozen zombie and resets both arms. Memory peaked at 89.4% with the first fixture running and stayed around 86.5% after cleanup, so the pursuit retry remains pending. Once the lab has headroom, run `pwsh -NoProfile -File logs/run-trial-980-cover-fixture.ps1`.

The post-rollout observer checks for the first two comparable site 1 teacher trials without moving the curriculum. It also allows one isolated retry during ordinary play if memory falls to 81.5% or lower. Live teacher completion, route and open-shelter deaths, and climb stalls are pending under the new controller.

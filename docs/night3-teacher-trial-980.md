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

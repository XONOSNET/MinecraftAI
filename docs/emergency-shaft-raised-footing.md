# Recover from uphill displacement before digging an emergency shaft

The latest completed teacher run reviewed was `world-1794716868899282100` (5 of 8 finished). The latest student baseline was `world-1794724302961123300` (4 of 8), and the last completed candidate `world-1794720833050838600` finished 5 of 8. The two latest student trials each recorded a `light_return` doorway stall with an available route and only a final movement snapshot. Their mines had already completed. The latest reports did not establish a reproducible unsafe mine exit or a common cause for both doorway stalls.

The recurrent emergency-shaft stop had a stronger reproduction. Student `LabAI1` in `world-1794698550459285500` stopped on dry same-level ground after displacement. The deployed `c600eed` fix covers that case. Teacher `LabAI2` in the current round 436 run `world-1794728266466427400` stopped with the same error under revision `55a31bdea55a3825`. Its refuge was at `(24655, 66, 16386)`. The stop report shows `dig`, a skeleton as the reason for cover, and a dry, grounded landing with body and head clear near `(24655.51, 67, 16388.41)`. The report does not include the two blocks beneath the original shaft mouth, so the reproduction uses the intact-shaft case. A separate changed-shell stop after excavation had a different failure context and was left outside this fix.

The existing recovery required footing within 0.2 blocks of the shaft's height, so the normal burrow tick threw `Emergency shaft footing changed` even on checked ground one block above a still-undug shaft. The focused regression fails on the previous controller at that relative landing. With the change, the tick rejects the old shaft, clears its route, and returns control to the interrupted `stone_return` phase without assigning lesson progress or changing its deadline. Recovery from elevated footing requires a loaded dry standable cell and two intact dry-earth shaft blocks. The regression also rejects opened, wet, and unloaded shaft cells. The normal hazard checks, dug-shelter handling, and lesson criteria still apply.

```powershell
node --test --test-name-pattern 'higher dry block|higher footing' tests/emergency-burrow.test.js
node --test tests/*.test.js
```

All 763 JavaScript tests passed. The regression verifies the controller's recovery and handoff. A completed live teacher and student comparison is needed to measure any change in survival.

## Live rollout on November 15, 2026

Round 436 finished on the previous controller. The lab retained the candidate after it completed 8 of 8 attempts against the saved baseline's 4 of 8. Normal curriculum progression moved the lab to site 4 at the same support level. The rollout waited for the completed comparison and no pending model restore, then paused the next baseline during terrain restoration and ran `scripts/Restart-Bots.ps1`. SHA-256 checks of the active and protected specialist checkpoints matched across the restart.

At 03:46 CST, round 438 had entered its live baseline under `world-1794735619093222300`. All eight reconnected bots reported controller `a0d043041e461ac2` from commit `c8a0ce3`. Paper remained ready on PID 36160, the dashboard responded, and learning resumed with the options present at the rollout boundary. This verifies the deployment. Round 436 results predate the fix, and round 438 has yet to supply a survival comparison.

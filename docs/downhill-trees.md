# Downhill tree discovery

Wood discovery previously scanned only logs strictly less than five blocks below the current bot position. This hid trees on lower terraces before tree selection or navigation could consider them. The loaded-chunk scan now includes logs up to 31 blocks below the bot (exclusive lower bound at -32); its 64-block spherical range, loaded-only palette filtering, result limit and asynchronous column yields remain intact. Stone scanning retains its separate height limits.

Tree selection still requires a reversible route. For approaches more than five blocks lower, route checks have a bounded 64-block horizontal radius and 2,048-node budget to accommodate climbable switchbacks. Candidate limits remain six trees and two normal approaches each. Exposed-surface detection now extends below Y0 to the world's minimum height, while still stopping at the first solid surface rather than searching through roofs.

Validation: all 275 JavaScript tests passed. New cases cover downhill scans across chunk-section boundaries, matching fallback behavior, lower-terrain selection, rejection of an unreturnable cliff, exposed negative-Y terrain and roof protection.

`scripts/verify_downhill_tree_native.cjs` built an isolated 12-block hillside in empty sky. The previous scan found zero logs; the new scan found three. The shared tree selector chose a lower approach, and actual Minecraft physics completed descent in 13.55 seconds and the return climb in 7.86 seconds. Both scans together took 7 ms in this small fixture. Because the fixture is above the training world's Y191 ceiling, it supplies known fixture surface heights checked with production `standable`; production surface lookup is covered by the terrain tests. Movement uses teacher intentions through the shared motor to isolate controller feasibility, not to claim neural lesson success.

The diagnostic grants no production inventory or learning outcomes; it removes its fixture and drops and revokes its temporary operator permission afterward. Results are in `downhill-tree-native.json`.

Automatic learning was paused with no pending model restoration, then the Node controller was restarted for the change. Resume options were preserved in `logs/downhill-trees-resume.json` so the same First Night site and support level begin a fresh comparison. Checkpoints, training data, identities, configuration and unrelated edits are preserved.

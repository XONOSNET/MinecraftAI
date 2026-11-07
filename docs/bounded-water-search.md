# Search for a safe crossing before discarding water routes

The first baseline after the bank-detour fix stopped Opal at
(24590.44, 64, 16459.27) during return_home. The geometric water route
required 26 consecutive wet cells and failed the 24-cell safety guard.
The bank-only search exhausted its reachable component short of home.

When a complete water route fails validation, WorldNavigation now retries
with the uninterrupted wet-cell count in the search state. This preserves
alternative approaches that reach a cell with more crossing capacity left.
A dominated approach (both more costly and more wet cells) is discarded.
The retry has a fixed 16,384-state limit and runs only for a rejected water
route; ordinary dry and already-valid water routes keep their normal search.
Existing checked dry-ending prefix rules apply if that bounded retry runs
out of search budget. No crossing, air, current or private-house guard is relaxed.

All 674 JavaScript tests pass. The new regression checks a complete route
via an island, then removes that island and confirms no overlong crossing
is accepted. Read-only native terrain inspection, with all eight house plots
protected, changed Opal's blocked plan into a complete 228-waypoint checked
route home. Successful physical execution and completion rates still need
live evaluation; the longer detour is a reliability measure, not a speed gain.

Deployment is queued after comparison 314. The worker restores any unvalidated
candidate, restarts only bots, verifies protected weights and Minecraft PID,
then starts and verifies a fresh comparison on one controller version.
The source is not live until the rollout report confirms that verification.


Rollout verification: `faf6013` loaded as `fbf92577a66b14b9` after
comparison 314 finished (6/8 baseline, 4/8 rejected candidate). The worker
verified unchanged protected weights and Minecraft PID, eight fresh
connections, and a progressing fresh comparison. Comparison 316 is using
that controller. Its first policy baseline finished 2/8: three deaths,
one failed changed-burrow-shell recovery, one clear-plot movement stall,
and one light-return doorway stall. There were no final long-crossing
rejection reports in that baseline, but the low overall completion rate
means an aggregate reliability improvement has not been established.
The prior teacher finished 8/8; repeated same-controller evaluation remains
necessary before drawing a conclusion from the mixed baseline failures.

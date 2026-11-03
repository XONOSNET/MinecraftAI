# Natural-site construction return investigation

## Reproduced failures

An unfinished-plot return cached a nominal entrance landing while its chunks
were unloaded. After loading, that cell was a grass block; the actual supported
landing was one block higher. Both 8,192- and 16,384-node searches rejected the
old target. Re-sensing the approach found a complete route to the new landing.
Increasing search budgets would not have fixed a destination inside terrain.

Floor construction and plot clearing now recheck cached loaded destinations.
If a destination is no longer a safe dry work landing, they select a fresh
checked approach. Unloaded destinations still allow the existing checked-prefix
travel. The normal route, player-space, private-plot, water and timeout checks
remain in effect. Trial initialization already resets these caches; this was a
within-trip loading issue, not a missing new-trial reset.

A separate stopped bot was floating at a valid shallow-water crossing under
leaves. The recorded policy chose action 6 while the teacher chose action 3.
Replaying its sensed terrain with a moving intention enabled forward swimming;
the route was not blocked. The activity message now distinguishes holding the
water surface from following a crossing. Policy holds remain policy holds;
they are not silently replaced with teacher movement or counted as progress.

Tulips also exposed a construction-clearing mismatch, fixed separately: they
were classified as natural obstructions but excluded from small-plant digging
fallback. Temporary-column failures retain their safety guards and now expose
the actual support and neighboring blocks for further diagnosis.

## Validation and limits

Regression checks cover cached destinations loading as solid ground, both
construction return phases, grounded blocked routes, airborne waiting, swimming
returns and truthful water activity. A gathering fixture now loads its expensive
registry before starting controller timers, removing a test timing dependency.

The disposable native flower fixture additionally checks swimming from a
contained shallow-water channel beneath a low leaf canopy onto a dry bank,
using the normal route planner, movement controller and survival physics.
It cleans its blocks, drops and diagnostic inventory afterward.

These changes address verified controller defects. They do not establish that
the student has mastered swimming, all construction routes or general survival.
New comparisons must use the same controller for baseline and candidate, with
previously unvalidated specialist weights restored before deployment.

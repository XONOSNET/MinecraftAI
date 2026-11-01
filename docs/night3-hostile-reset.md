# Reset hostile entities between Night 3 attempts

The first comparison after the defense update lost all eight baseline bots and
all eight teacher bots in roughly 29–53 seconds. Reports confirmed that the new
defense handoff was activating. A read-only survey then observed 27 distinct
hostiles across four sectors: 13 zombies, four skeletons, two spiders and eight
creepers. The survey alone cannot distinguish old mobs from newly spawned ones.
Code inspection established the reset defect: block cloning and dropped-item
cleanup did not remove natural hostile entities, allowing threats from previous
attempts to carry over into restored terrain.

Night 3 preparation now removes ordinary hostile entities from each restoration
destination while its chunks are loaded. Snapshot storage sources are not swept.
A final bounded-area sweep before deployment removes loaded preparation-time
hostiles, then waits for drops before the existing item cleanup and player
deployment. Explicit combat-fixture entities (`lab_combat`) are excluded.
Players, livestock, ordinary spawning, global time, difficulty and survival
requirements are unchanged. The helper refuses to run outside preparation;
there is no active Night 3 hostile sweep or ongoing monster protection.

Validation: all 318 Python tests passed. Added tests verify destination-only
scope, full-height bounded selectors, preparation/deployment ordering, a settling
interval before the final item sweep, protected combat entities, and no running
or paused-trial cleanup. The existing chunk-preloading, clone acknowledgement,
bounded copy and item cleanup checks also passed.

This fixes reset consistency; it does not demonstrate that the current policies
can survive an ordinary night. New mobs may spawn normally during an attempt,
and early combat, creeper avoidance and obtaining provisions remain areas to
evaluate. This Python service change requires a normal lab restart. Checkpoints
and demonstrations are preserved, unvalidated weights are restored first, and
automatic learning resumes at the existing Night 3 site with a fresh comparison.

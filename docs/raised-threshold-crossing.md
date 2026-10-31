# Crossing a raised home threshold

A route can jump onto a raised doorway before the doorway alignment controller
takes over. The old alignment target was 1.15 blocks outside the door plane.
When that point lay over lower ground, a bot already standing safely on the
threshold could refuse to back off and remain stuck until its attempt ended.
This occurred during a teacher `stone_return` in independent settlement.

An already-centered bot near the plane of an open door now commits to crossing.
Off-center approaches still align first. Closed-door handling, body-clearance
probes, low-ceiling crouching and checked climbs remain in effect.

Validation:

- Regression cases cover both door axes and crossing directions, blocked paths,
  closed doors and the existing off-center back-off behavior.
- `node scripts/verify_threshold_native.cjs` creates an isolated raised house,
  then tests the crossing in survival and removes its fixture afterward. It
  does not send learning reports or give resources to production bots.
- In the same native fixture, the previous controller stayed at its start
  position for 20 seconds, reporting `Recovering: lining up doorway`. The fixed
  controller entered in 0.9 seconds with full health.

The teacher wall-placement refusal observed in the same check is a separate
remaining issue; this change does not claim to resolve it.

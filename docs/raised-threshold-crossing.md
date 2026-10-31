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

## Stepping down on exit

A later teacher run exposed the complementary exit case: doorway alignment
owned movement while the route still targeted the sill at door height. The
strict safety gate consequently rejected the lower ground outside, even though
the route had already checked a safe one-block landing.

The route now explicitly marks that next lower landing on its doorway
descriptor. Crossing can use the existing one-block descent probe, and the
motor preserves that permission through its strict safety gate. An absent,
level or deeper landing does not authorize this behavior. Clearance, hazard
and landing probes still stop unsafe movement.

The native fixture now tests both entry and exit. The previous controller
entered but froze at the exit for 20 seconds. The fixed controller entered
in 0.9 seconds and stepped down outside in 2.0 seconds at full health.

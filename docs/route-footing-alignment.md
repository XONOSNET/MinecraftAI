# Checked bank departure alignment

Candidate trial 739 stopped OakToad after 90 seconds near
`24673.586,64,16496.048`. Its next dry bank waypoint was valid, but the
body-width walk probe crossed a lower neighboring corner before reaching it.
The planner's cell centers and the bot's off-center departure disagreed.

Navigation now offers a short alignment cue to the current cell center only
when the intended local segment fails its normal walk/descent check and the
entire alignment move passes the existing full-body, dry-footing check.
Loaded terrain, fluid/current checks, player clearance and grounded status
remain required. The route and destination remain intact. Centering does not
reset progress, mark an interaction successful or permit a deeper drop.
Airborne movement and committed gap jumps retain their existing control.

Regression tests reproduce the corner, reject unsafe or occupied alignment,
and exercise navigation returning to the original route after centering.
`scripts/verify_route_alignment_native.cjs` uses a disposable sky fixture:
the original probe rejects the departure, the actual movement controller
centers and crosses without falling or damage, and the fixture is cleaned.
This passed before rollout. Full survival transfer remains to be measured;
doorway failures and other causes of failed bank descent are separate issues.

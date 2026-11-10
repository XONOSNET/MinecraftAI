# Checked descent from beds and other partial-height surfaces

Teacher trial 785 stopped OpalWren at Y 71.5625 while the next waypoint was
71.1. The body was grounded on fractional-height support, but the route motor
recognized a descent only when the waypoint was more than 0.6 blocks lower.
Its flat-walking probe therefore rejected this half-block-height departure.

The route motor now recognizes a downward cue beyond 0.2 blocks as a descent,
within its existing less-than-1.2 waypoint-height bound. The same full-body
landing probe still permits at most one block of physical drop, checks the
immediate landing, and rejects fluids, hazards, missing terrain and unsupported
ground. Descent still requires heading alignment and suppresses sprinting.
No progress timestamps, lesson criteria or movement permissions change.

The regression uses a real bed-height collision shape and verifies a permitted
departure, then rejects water, lava, unloaded cells and missing support.
`scripts/verify_partial_descent_native.cjs` reproduces the 0.5625-height start
on a real bed in a disposable sky fixture. Flat walking rejects the departure;
checked descent completes with full health. The fixture was cleaned after the
successful run. Survival transfer remains to be measured after rollout.

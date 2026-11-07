# Safe gap takeoff and bounded retry feedback

The user observed BirchBadger repeatedly missing a mine crossing, falling in,
and circling back. The terminal navigation report captured an upward recovery
step inside the mine; it does not prove what caused the initial missed jump.
The user also identified possible overhead leaves or an early takeoff.

Two code defects made those causes plausible: gap clearance checked only
through feet Y+2, although the jump apex can reach the next overhead layer;
and the motor could launch from anywhere on the departure block. Gap routes
now require the additional overhead layer to be clear. Before launching, the
motor approaches a supported takeoff point 0.22 blocks toward the edge from
cell center, aligns laterally and rechecks the gap. It then holds forward through
the committed jump. Ordinary steering preserves takeoff alignment; explicit
holds and danger can still cancel it.

Physical landing or timeout feedback tracks directed crossings per trial.
After three failures, the motor refuses that crossing and the route planner
excludes that edge for two minutes, including remembered and water fallback
routes. Other approaches to the same landing remain valid. Existing paths are
invalidated promptly, successful landings clear failures, and a new trial resets
history. Safety cancellation is not counted as a failure. History is bounded
to 64 entries. Navigation telemetry reports excluded crossings and retry time.

All 688 JavaScript tests pass, covering repeated physical misses followed by
an alternate checked route, edge direction, cooldown, trial reset, interruption,
early takeoff and overhead leaves. The disposable native fixture verified an
ascending step, a real gap crossing starting near the back of its departure
block, rejection of an apex-height leaf and full cleanup. Read-only inspection
at BirchBadger's recorded mine position found a checked route home avoiding
the terminal failed step. That is route evidence, not a replay of the original
missed jump or proof of its cause.

The requested fix is loaded with a controller-only restart and a fresh
same-controller comparison, retaining demonstrations and restoring protected
models first. This also loads the previously queued local home-repair fix.
Minecraft and the dashboard remain running. Live rollout status is recorded
locally and must verify fresh telemetry and automatic learning progress.

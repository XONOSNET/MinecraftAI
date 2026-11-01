# Wall placement and recovery

The builder previously retried the same supporting face after a server refusal.
Changing its standing position did not ensure a different click. The branch for
out-of-reach remaining blocks also used a guessed interior destination, which
could repeat without providing a useful placement angle.

Placement now prefers visible, in-reach support faces, excludes interactive
workstations and containers, and tries a different support after a refusal.
The existing assisted ceiling placement remains available when a direct camera
ray cannot reach the top of the wall. Each placement must confirm the expected
block at its destination before the action counts as successful.

Interior retries select a safe, player-clear, route-checked stance with a
reachable support face. Failed faces are bounded per action; stance retries
remain bounded per block. The builder still stops rather than granting supplies,
removing finished construction, or pretending a block was placed.

Validation includes regression tests for visible-face preference, blocked and
out-of-range faces, interactive supports, alternate faces after refusal, and
unconfirmed placement. The isolated survival fixture in
`scripts/verify_wall_faces_native.cjs` confirms actual high-wall and ceiling-gap
placements, then cleans its own volume. Production bots receive no test items
or learning reports from these fixtures.

All 382 JavaScript tests pass. A second isolated survival fixture completed the
wall/roof build on a prepared floor in 51 seconds: all 144 blueprint cells,
the real door and the enclosed interior verified, with outside foliage retained.

# Leave shelter before scouting wood

After a night retreat, bots resuming wood gathering could remain inside a closed
hut. Nearby tree selection and expedition reachability correctly rejected paths
through its closed door, but gathering never initiated an exit. The bot then
reported no safe unexplored destinations and eventually hit the stationary
deadline even though outdoor resources still existed.

The shared First Night scouting helper now crosses the completed hut's sensed
entrance before selecting or rejecting outdoor search patches. It keeps that
exit goal until arrival, then clears the planning throttle and resumes scouting.
Nighttime and visible-threat shelter decisions still run first. This adds no
resources, bypasses no doorway collisions and awards no progress for searching.

Validation includes a two-tick exit before any outdoor destination search,
continued scouting after arrival, existing shelter-priority checks and all 486
JavaScript tests. Load at a completed-comparison boundary so both sides use the
same controller and active survival attempts are not interrupted.

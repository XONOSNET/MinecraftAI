# Body-safe route smoothing

The grid planner previously generated four-direction paths and travelCue joined only collinear waypoints. The follower therefore visited each corner of a staircase-shaped route, repeatedly turning and braking on otherwise traversable ground.

WorldNavigation now chooses a short direct leg across nearby waypoints, checking the complete 0.6m-wide player body with an additional margin. Samples are at most 0.15m apart. Every touched cell needs loaded, standable ground at the same elevation, headroom, permitted plot access and boundary clearance. The segment also respects player clearance. Doors, precise centering points, airborne landings and height changes keep their original waypoints. The existing motor still checks ground and obstacles while moving.

Bypassed waypoints are removed, and the shortcut becomes the route corridor. The bot cannot turn back to satisfy a skipped grid corner. This is bounded local path smoothing, not arbitrary curves through obstacles or a change to policy weights. Narrow terrain can still require slower, sharper turns. Smoothing applies to teacher and policy world routes alike; a fresh paired comparison is required after deployment.

Validation: all 328 JavaScript tests passed. Added checks cover diagonal shortcuts, removal of bypassed corners, the full body clipping an unsupported edge, walls, unloaded blocks, private plots, player clearance, doors, steps and precise landings.

A read-only native survival test replayed the same 16-leg zigzag on an existing flat lab floor using the same motor and teacher actions, without terrain, inventory or learning writes. Both runs arrived with full health. Before: 7.784s, 71 stopped frames out of 156, accumulated yaw travel 24.55 radians. After: 3.885s, 23 stopped frames out of 77, yaw travel 3.15 radians, 15 bypassed waypoints. This is one controlled example, not a guarantee of the same speedup on all terrain. Evidence: logs/route-smoothing-native.json. The diagnostic fixes its original controller revision for reproducibility.

# Raised door and stone ledge navigation

Two recorded motor stalls were reproduced in Minecraft before repair:

- LabAI7 / DuskMoth remained below its porch at Y64 for the full 12-second replay. Its route requested a jump to Y65, but doorway alignment replaced that intention with stationary walking controls. Door alignment now defers to the verified route while below door level or airborne. It resumes once grounded at the doorway elevation. Closed-house exterior approach points also use the actual standable ground height, rather than assuming the house floor extends into the yard.
- LabAI2 / AmberRobin remained stationary for the full 12-second stone-ledge replay. A safe 0.29m centering leg ended before the next turn, but the motor's 0.7m player-clearance probe continued beyond it, slightly entering another bot's clearance radius. Precise alignment legs now cap that forward probe at their stopping point. The clearance radius and backwards safety probe remain unchanged; ordinary travel still probes the full distance.

With the repairs, the same raised entry reached the house in 2.436s and the same ledge route reached its upper destination in 2.726s. Geometry teacher intentions drove the shared motor, with recorded neighboring-player perception in the ledge case. These are physical-controller reproductions, not tests of neural action accuracy or full lesson success. Proofs: `raised-door-before.json`, `raised-door-native.json`, `stone-ledge-before.json`, `stone-ledge-native.json`.

All 258 JavaScript tests passed, including raised-entry jump preservation, airborne door deferral, real-height closed-door approach selection, and player-clearance acceptance/rejection at precise waypoints.

Deployment preserves protected model weights and data, restarts only the Node controller, and starts a fresh paired comparison at scenario 2, First Night level 1.

# Overnight check: October 28, about 04:00 Central

## Observation

Server healthy at 20 TPS and 9 ms/tick; eight connected, fresh bot heartbeats; no infrastructure-failure count or controller error log entries. Automatic level-1 baseline on scenario 2 was about 55 minutes into its one-hour budget. Four bots had built complete huts, three had registered hut/storage/tools milestones, and one had mined stone. None had finished the full First Night chain. There was no new completed model comparison since the two level-0 7/8 candidate results that earned promotion.

Concrete stops included three valid route legs blocked by ground probes (LabAI0, LabAI7, LabAI4), one server-rejected jump placement ending LabAI6's attempt, and one student choosing to wait inside a completed hut (LabAI3). The latter remains a policy behavior to learn from, not a fabricated success or a teacher override.

## Reproduction and repair

The diagnostic player reproduced all three route holds on their saved positions and unchanged natural terrain. Using the student motor configuration with geometry teacher intentions, each failed to reach its immediate waypoint for 12 seconds before changes. After changes: LabAI0 0.600 s, LabAI7 0.563 s, LabAI4 0.975 s. This isolates motor execution from neural action selection; it does not measure the student's learned navigation accuracy.

- Center an off-center route start near diagonal drops, as well as cardinal drops.
- Limit world-route ground probes to the next verified waypoint. Previously the default 0.75-block check extended past nearby safe landings into a drop. Footprint, hazards and real terrain are still checked.
- Brake approaching the waypoint based on measured closing velocity. This safety focus does not select the student's yaw/action.
- Treat a specific server placement rejection as an unsuccessful placement, release jump controls, and allow at most one retry before selecting another approach. Unexpected errors still propagate; no successful placement is claimed without authoritative block state.

Evidence: `overnight-policy-probes-before.json`, `overnight-policy-probes-native.json`; runner `../scripts/verify_terrain_route_native.cjs --policy-probes`. 236 controller tests pass, including safe landing vs. unsafe endpoint, momentum braking without steering, and jump rejection cleanup.

## Deployment

Automatic learning paused with no pending candidate bundle to restore. Only the Node controller restarted. Resume a fresh comparison at the same level 1, scenario 2, preserving models, training data, bot identities and settings. Full level-1 completion is still unverified; recurrent navigation and resource acquisition remain the main limitations.

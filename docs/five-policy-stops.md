# Five stops in the first expanded policy baseline

## Diagnosis

Round 103, level 1, scenario 2: all eight bots connected, health 20 and no controller errors. LabAI1 and LabAI3 had finished their huts and selected wait roughly one block from the room center. Both were actually fully inside intact, closed huts. The world controller required entry within a 0.8-block central circle before starting shelter verification, so these appropriate waits were falsely treated as stalled entries.

Three other stops were execution holds:

- LabAI2 stood partly over a ledge with its body still supported. The all-four-corners safety probe refused the short move back onto solid ground because the trailing corners initially remained over air.
- LabAI6 saw a wall in its current facing direction. Recovery swallowed its requested turn toward a verified clear route, leaving it in a bounded recovery loop.
- LabAI7's route planner inserted a centering waypoint that entered another bot's two-block clearance zone, even though the route's original departure edge was clear.

Resource starvation/deaths were not the causes of these five stops. Other bots reached stone search 87–107 blocks from home, confirming use of the expanded expedition area. Full survival success remains unverified.

## Changes

- Allow a grounded, partially supported body to regain complete footing only when sampled support never decreases, the destination fully supports all four footprint corners, and the swept body corridor contains no unknown blocks, contact hazards or obstruction. Ordinary strict ground checks remain; no movement out over a gap is permitted.
- Allow policy-requested turning toward a checked clear, level route before applying wall recovery to the old viewing direction. Safety code does not choose a different model action or heading.
- Check centering detours against the same neighboring-player clearance used by route edges.
- Accept a grounded full-body position safely inside the own room as entry. Still require an intact enclosure, closed door, safe interior position, and the full three-second hold before awarding the hut milestone.

## Validation

248 controller tests pass, including ledge recovery vs. outward movement, fluids/unknown blocks/ceilings, crowd clearance, safe entry and the three-second/closed-door completion checks.

Native physical reproductions on unchanged terrain, starting at saved positions and yaw, failed for 12 seconds each before the movement fixes. Afterward, the blocked legs completed in 0.262 and 0.477 seconds, and the crowd case's full route completed in 2.129 seconds. The crowd case replayed the recorded neighboring-player perception without moving/spawning a production bot. Geometry teacher intentions were sent through the student motor to isolate execution; these are not claims of neural policy accuracy. Both saved house positions were independently confirmed inside intact, closed huts. No production rewards/examples were fabricated.

Evidence: `policy-stops-before.json`, `policy-stops-native.json`; runner `../scripts/verify_policy_stops_native.cjs`.

Learning was paused with no candidate restoration pending. Deploy only the Node controller, then a fresh comparison at the same support level/site using the same controller on both sides. Models, training data, identities, configuration and unrelated changes are preserved.

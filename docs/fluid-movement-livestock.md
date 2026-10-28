# Continuous travel, looking and animal maintenance

The route motor now aims up to four metres along collinear, checked, level route cells. It retains the original path, preserves turns, side-centering and changes in elevation, and consumes waypoints physically crossed between replies. This reduces per-cell braking without removing support, hazard or player-clearance checks. Safe single-block descents still use walking and verified landings, rather than blind jumps over drops.

World travel can start sprinting with 4.5m of straight runway and continue until 3m remain. Ground, food, body clearance, corners and hazards still gate sprinting. A held sprint uses the same bounded movement-intention lifetime as walking, with a 100ms reserve before expiry, rather than expiring 750ms early. Harvesting, doorway alignment, crouching and recovery retain their own controls.

During route travel the head smoothly follows destination elevation with a gentle vertical scan. Aiming locks for mining, interaction and building take priority. This changes the actual viewing pitch; it does not claim a new learned scanning skill.

Natural First Night training levels now check passive population every 120s, beginning 30s after deployment. Caps are 24 sheep, 12 cows, 8 pigs and 12 chickens, counting existing animals within the expedition region. Each wave attempts at most two replacements per species at rotating map locations. The server recounts before each summon, checks grass and neighboring grass supports, empty body/head space, distance from players, and excludes home plots. Replacement sheep are white; animals retain normal AI. Existing supported lesson stations keep their owned replacement rules, and reserved assessments do not receive periodic additions. No items, wool or completed milestones are granted. The dashboard describes this training assistance and population caps. Configuration lives in `config/world-resources.json`.

Validation:

- 260 JavaScript tests and 257 Python tests passed.
- Native, identical two-second flat-route runs compared controller revision `25dbda9` with this change: walking distance 6.87 → 8.37m, stopped frames 8 → 0; sprinting distance 7.55 → 10.82m, stopped frames 12 → 0. Short three-metre trips did not sprint. These are controlled motor tests using geometry teacher intentions, not neural-policy performance claims. Proofs: `fluid-movement-before.json`, `fluid-movement-native.json`.
- A real one-block ascent completed in 0.974s and descent in 1.177s with zero reversing frames. See `fluid-steps-native.json`.
- Native grass-platform fauna test spawned four animals under one-per-species caps, remained at four on a repeated wave, and spawned none after replacing the spawn support with water. See `fauna-refill-native.json`.

Deployment restores protected models, restarts the lab to load the Python scheduler and starts a fresh comparison at the same scenario-2, level-1 site. Model checkpoints, datasets, bot identities and unrelated working changes are preserved.

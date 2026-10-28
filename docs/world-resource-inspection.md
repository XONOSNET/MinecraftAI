# Natural-resource trial inspection

Read-only inspection of active level-1 teacher trial, scenario 2, bounds x=24576..24704 / z=16384..16512. A temporary spectator observed loaded terrain and the saved template; production bots, models, terrain, settings and the learning loop were not changed.

## Measured wood supply

All 64 site chunks and all 64 saved-template chunks were counted, for log blocks at Y=32..127.

- Saved natural template: 655 log blocks across 189 trunk/branch columns.
- Prepared camp's 45x45 clearance replaces 206 of those log blocks (floor Y=64 and cleared volume Y=65..74), leaving 449 after setup.
- Current live site: 115 log blocks across 59 columns, after camp setup and harvesting. This is physical wood still present, not a promise of reachability.
- 95 pass the current local water/hazard filter; 37 have an adjacent standing position within normal reach and another 21 fit the vertical build-up budget geometrically. These counts precede path and visibility validation.
- At sampled bot positions, only 1..7 logs met the current scan-distance/height, visibility-or-soft-obstruction, and local safety filters.
- One earlier full census of the surrounding one-chunk ring (100/100 columns including the site) counted 410 additional logs outside the permitted boundary. The final repeat loaded 99/100 columns and counted at least 390 there. They are unavailable to the bots because their trial boundary remains fixed.

## Search limitations confirmed in code

- First Night requires 128x128 resettable sites (`lab/world_training.py`). The bots may travel around this area but cannot expand the expedition beyond it.
- Wood acquisition scans within 64 blocks and approximately five blocks below/eight above the bot, with visibility and safety filtering (`controller/resource_scan.js`, `controller/hut_teacher.js`). Remaining high, occluded or wet-edge wood can be missed or rejected.
- Exploration appends up to six remembered approaches, then eight candidates per radius (8,16,24,32). It tests only `candidates.slice(0,18)` and takes the first reachable result, so nearby candidates can repeatedly exclude farther frontiers (`controller/first_night.js`).
- The 144-block house alone consumes roughly 36 logs' worth of planks per bot, before recipe overhead, chests, tools, fuel and beds. Eight bots therefore put substantial pressure on the post-clearance stock; the remaining wood is increasingly difficult to acquire.

## Finding

The user's observation is supported: resource depletion and constrained/near-first exploration both contribute. Bots are physically exploring and reaching edges, but cannot use the abundant adjacent forest. This is not purely insufficient neural training.

A follow-up should preserve more original trees during camp preparation, verify a suitable resource budget per site, and use depletion-aware, farther-frontier search. A larger resettable resource region needs coordinated boundary, terrain/animal restoration and evaluation changes; it should not silently let bots harvest outside the restored comparison area. No production changes were made during this inspection.

Raw evidence: `world-resource-inspection.json`; observer script: `../scripts/inspect_world_resources.cjs`.

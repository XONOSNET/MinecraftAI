# Natural resource and exploration overhaul

## Result

Natural-resource First Night levels (1–3) keep the existing 128x128 core, site coordinates, camp anchor and support level, with a 16-block resource ring on every side: 160x160 total. Level 0 and other mission layouts retain their previous behavior. No planted replacement resources or inventory grants are introduced for natural levels.

Natural camp preparation clears the eight house footprints, front porches and connecting walking lanes, preserving the grove between them. A read-only count against the existing pristine site measured 56 logs removed by the new layout versus 206 previously: **150 additional core logs preserved**, with 599 core logs remaining after setup instead of 449. This is a physical wood count, not a guarantee of accessibility. The added ring provides further natural resources.

## Exploration and mining

`controller/exploration.js` keeps independent physical cell-visit counts and temporary per-resource depletion/rejection records. It scores a grid across loaded terrain (up to 80 blocks away), rotates failed route candidates out for 90 seconds, and checks eight routes per planning pass with yields between work. This removes first-18 near-candidate starvation. Short shared destination reservations spread bots across patches; they do not share neural memory. Private home areas and simulation boundaries remain excluded. Resource landmarks known to have been removed are discarded.

Wood acquisition still uses bounded loaded-chunk scans and real visibility/safety checks. Stone acquisition now filters exposed blocks before truncating results, instead of letting nearby buried stone consume the candidate list. Exposed adjacent floor stone can be mined while the bot's own support remains protected. Fluid-adjacent or unloaded mining targets are excluded. All digging and building remain real Minecraft actions.

The dashboard shows the actual expedition size, resource-ring policy, per-bot patches visited, tested routes and distance from home. Its 48-log-per-bot planning allowance is explicitly a demand estimate, not a measured site census. In-game activity messages identify scouting and search distance. Controller/model dimensions are unchanged.

## Saved terrain and fauna

The existing pristine core snapshot is preserved. On first expansion, only the previously unused ring tiles are snapshotted, then the full 100-chunk area is restored. Later resets restore all 100 chunks, including underground, with existing item cleanup. Glass boundaries move to the outer region; old boundaries disappear when the pristine core restores.

The original saved core fauna list is retained. Original ring animals are captured once into a separately guarded storage list before any restore can remove them. Core/ring restoration tags are distinct, preventing one list's entity updates from targeting the other. Restore uses fresh UUIDs; it never fabricates killed animals or rewards during a run. At most 32 saved animals per species/list are restored, preserving the existing bounded population policy. Temporary force loads are released after acknowledgement or cancellation.

## Verification

- 242 JavaScript tests and 255 Python tests passed, including expansion migration, unchanged supported levels, camp preservation, separate fauna storage/tags, farther destinations, shared reservations, route rotation and exposed stone before result caps.
- Native read-only tests found valid farther search routes from three real terrain positions (18–27 blocks away, after marking local patches depleted), with planning at 22–29 ms. Loaded exposed-stone scans took 3–21 ms and found candidates at two of those positions.
- Evidence: `resource-overhaul-census.json` and `resource-exploration-native.json`.

Automatic learning is paused before deployment and any unvalidated model bundle restored by the existing scheduler. The Python/backend change requires one lab restart, then a fresh paired comparison at the same level/site. Saved models, examples, identities and configuration are retained. Full survival completion remains unverified; this overhaul addresses resource supply/search constraints, not all navigation or learned-policy weaknesses.

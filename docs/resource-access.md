# Resource access skills

The shared world controller can clear a short soft-block corridor to selected wood, then use a temporary column to reach higher logs. Both teacher and policy world runs use these physical execution helpers; the neural action space, model dimensions and learned weights are unchanged.

- Clear visible, reachable dirt, grass, vines and leaves along a loaded corridor to a selected log. Maximum three obstructions in a corridor and six successful removals per tree acquisition. Hard walls, unknown terrain, blocks below the feet, house plots, adjacent fluid and falling material are excluded.
- Consider ground stances two or three blocks from an obstructed trunk. Prefer ordinary reachable trees; consider tall-tree approaches only with carried full building blocks.
- Center on a verified dry, full supported cell before jump placement. Use real carried dirt/stone, then planks as fallback. Maximum three new blocks; no commands, teleports, resource grants or synthetic progress in production.
- A bounded movement lease prevents the ordinary idle motor from cancelling a physical jump. Explicit motor pause cancels the lease; expiration returns control to the motor. Each placement requires server-confirmed block state.
- Hold footing while the gathering policy chooses its action. Remove only tracked, unchanged temporary supports, one at a time onto verified solid ground, before leaving the tree or changing phases. Unexpected displacement/support changes stop safely.
- Activity messages describe clearing, centering, temporary height and descent. No new client dependency.

## Validation

231 JavaScript tests passed. An isolated survival diagnostic with the actual movement controller confirmed dirt and leaf removal, off-center alignment, three consecutive real jump placements, a high log harvested with an axe, and three verified descents back to the starting height. Evidence: `resource-access-native.json`; runner: `../scripts/verify_resource_access_native.cjs`. Fixture resources belonged only to the diagnostic player; no examples, models or production inventories were written. Fixture blocks and items were cleaned up.

Automatic world learning was paused with no candidate restoration pending. Deployment restarts only the Node controller, then begins a fresh comparison at the saved support level and site. Full eight-bot completion with this controller is not yet established.

## Limits

This is bounded access assistance, not a general excavation planner. It does not tunnel through stone or dig beneath natural supports. Dense canopies without safe headroom, trunks beyond the height budget, and sites without suitable carried material still require another approach/tree. These helpers extend execution skills; they do not mean the network has independently learned a new placement action.

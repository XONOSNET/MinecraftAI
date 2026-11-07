# Clear an exposed canopy face before installing the outdoor torch

Teacher trials 699 and 702 both stopped with `light_place: Construction
obstruction needs a closer safe angle: spruce_leaves`. At the recorded stance
near (16385.73, 66, 16415.17), a read-only native terrain inspection found the
outdoor mount at (16384, 68, 16415) occupied by leaves without a direct sightline.
Other leaves in the existing entrance strip were visible and reachable.
The lighting path tried to dig the hidden mount directly and terminated.

Outdoor lighting now yields to the existing entrance-canopy clearing routine
before native placement. It clears exposed leaves in the bounded front strip,
retains safe stance recovery and preserves other plots, supporting ground,
construction and leaves outside that strip. It adds no supplies or lesson credit.
Danger, water recovery and committed movement still run before this handoff.

All 680 JavaScript tests pass. A transition fixture clears a canopy, preserves
out-of-strip leaves and wood, resumes torch placement and verifies the correct
wall mounting. Native inspection confirmed route/visibility conditions; physical
success in the repeated teacher case still requires the next evaluation.

This is bundled with the stone-tools workstation-return fix after comparison
322. The earlier one-time worker cancelled itself on source change; its
replacement waits for the same completed-comparison boundary. Do not treat
the source as deployed until the new rollout report verifies live versions,
protected weights, component health and fresh comparison progress.

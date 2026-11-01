# Safe entrance canopy clearance

November 1 update: OakToad's gathering route recorded over 400 replans while
alternating a blocked resource goal and a short entrance-clearing approach.
The approach is now retained across movement ticks until it arrives or fails.
A change of lesson, original goal or trial cancels it. This prevents the original
blocked route from discarding the detour on every update. Multi-tick persistence
and cancellation regressions are included in the 411 passing JavaScript tests.

October 31's midday check found LabAI0 repeatedly stopping in `leave_hut`, even
on a teacher pass. Native inspection of its completed house showed an open
door, a one-block lower exterior, and spruce leaves immediately over that
exterior step. Ordinary descent was reachable; reversible navigation correctly
rejected it because the leaf cap prevented jumping back onto the door threshold.

The controller now handles a blocked home approach by looking for leaves in a
three-block-wide entrance strip, four to six blocks in front of the house.
It removes only actually reachable, visible foliage using native digging from
safe footing, moving to a checked work stance first when necessary. Ground,
constructed blocks, adjacent fluids/falling materials, other players and other
bots' plots remain protected. No building supplies are granted. Real leaf
removal resets navigation and counts as progress; safe-return requirements are
unchanged. The helper only applies near the home for home-related destinations.

Validation: 364 JavaScript tests pass. `scripts/verify_entrance_native.cjs`
recreated a raised enclosed house, real open door, lower outside ground and
spruce leaf ceiling in verified-empty diagnostic sky space. The initial
reversible route was blocked. In survival, the bot removed one leaf, exited in
14.6 seconds and returned through the door in 14.6 seconds, retaining 20 health.
The fixture was cleaned, and no learning or reward records were written.
Evidence: `logs/entrance-native.json` and `logs/home-route-inspection.json`.

Other observed issues remain separate: LabAI7 sometimes cannot return to the
unfinished floor, and LabAI2 had a doorway-alignment stall while returning with
stone. This fix does not claim those paths are resolved. The latest completed
baseline before deployment was 7/8; the following teacher pass completed 5/8.
Those scores include scripted crafting/building helpers and are not evidence
that the updated neural candidate has been accepted.

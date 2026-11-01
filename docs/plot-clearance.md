# Clear the house plot before building

Run world-1793454820713692800 exposed a limitation of placement-time excavation: several bots reached 71–138 of 144 house blocks before existing walls hid remaining spruce/birch leaves from their digging rays. One early workbench attempt failed on a double-height fern. Another failure was a separate distant return-route problem.

A new clear_plot phase prepares the entire 7-by-7 house volume, from standing height through the roof and one extra block above it, before gathering/early workbench placement. Crafting the main house supplies triggers a second scan before floor construction. Natural leaves, plants, logs and stable earth/stone are broken through real survival interactions; no resources are injected and the ground foundation is excluded. Existing furniture, finished blocks and neighboring plots remain protected by the shared clearer.

The controller selects exposed reachable blocks, settles before digging, and walks to other checked work stances when needed. A refused angle defers that target briefly instead of immediately stopping the bot. Scans must load the entire volume before declaring completion. Successful clearing contributes to the ordinary progress/stall tracking, and the dashboard/in-game status reports clearing counts and movement to work faces. Placement-time checking remains as a fallback for later changes, but walls are no longer built around the initial canopy.

Validation: all 340 JavaScript tests pass. Unit coverage includes full-volume scope, preservation of foundation/outside vegetation/furniture, deferred digging angles, footing and unloaded terrain. A separate native survival fixture cleared 62 actual obstructions (dense canopy, overhead leaves, double-height fern, logs and a flower) in about 52 seconds. All 25 original foundation tiles remained intact before floor work. It then completed the full 144-block house, with 25 wooden floor tiles and the closed door, in 148 seconds total; an outside birch leaf was preserved. Temporary terrain was removed afterward. Setup materials were given only to the diagnostic account; its /step and report calls were local stubs, with no training/replay/model/result writes. Evidence: logs/plot-house-native.json.

Only the separate diagnostic fixture used creative mode for initial sky setup, then survival for all clearing and construction. Production bots continue using survival mode. No client mod or Minecraft restart is required for this controller rollout. Any unvalidated models are restored before a fresh comparison with the same updated controller on both sides. The known distant return-route failure is not claimed fixed here.

## Returning after a distant wood trip

Night 3 comparison 185 exposed two `clear_plot` stops after distant gathering.
Clearing used local, 16-block work-stance searches while the bots were still
far from their house plots. It now first uses the existing checked home-return
planner, including its unloaded-home approach, then resumes local clearing.
The return target resets when the controller begins another trial.

A native regression test also exposed a private-plot conflict: work stances on
the own plot's outer strip were forbidden because they were outside the narrower
room bounds. Only `clear_plot` routes explicitly authorize their own construction
volume; neighboring plots remain private, and physical terrain/player checks
remain in force. General travel does not receive this permission.

All 395 JavaScript tests passed. The isolated native fixture
`node scripts/verify_plot_return_native.cjs` returned over 50 blocks along a
checked route and removed a real house-plot leaf in survival mode, in 10.8
seconds with full health. The fixture and drops were removed afterward. The
initial fixture run diagnosed the private-border rejection; the final run
passed with the same terrain and target. No production progress was fabricated.

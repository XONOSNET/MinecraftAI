# Survival transit and unprepared pastures

Mine returns now wait when another player's normal clearance radius temporarily
blocks the next recorded stair. Waiting does not mark the stair complete or reset
progress deadlines. A failed return without that player obstruction still reports
the route failure, and terrain support checks remain unchanged.

A bot already standing on its checked, supported waterside landing may now
complete an empty transit route. This previously fell back to the stricter dry
work-footing route and became stuck outside the door. Empty routes cannot
authorize a distant goal, airborne arrival or open-water destination. A read-only
inspection of BirchToad's actual failed position now reports arrival correctly.

Wilderness sheep replenishment no longer requires a prepared camp to inspect
walked pasture candidates. Unprepared trials use the site center and bots'
reported house plots. Both walked candidates and regional fallback points exclude
those plots. Existing grass/headroom checks, player distance, sheep spacing,
population cap, two-birth wave limit and replenishment interval remain unchanged.
Animals still require normal pursuit and gathering; no inventory items are given.

These changes load together with the pending closed-hut scouting fix after the
current comparison. A service restart is required for pasture selection; preserve
models/data and verify all components, fresh bot telemetry and learning progress.

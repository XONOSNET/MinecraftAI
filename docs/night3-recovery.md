# Food-aware recovery during Night 3

At the first hourly check, comparison 185 had seven stopped bots and one bot
waiting in `night_recover` at health 16, food 17, for much of a 52-minute attempt.
The old planner required health 18 to resume but did not consume food above
food level 16, and excluded recovery from emergency foraging. Health cannot
regenerate with food below 18, so waiting could not solve this condition.

Recovery now eats a carried meal when injured below health 18 and food is below
18. A bot interrupted into recovery can also eat the existing safe raw foods;
raw chicken remains excluded. If it has no meal, has an axe, health is at least
12 and no visible nearby threat exists, it takes the existing real food-foraging
trip. That trip retains the original interrupted lesson and returns through
`night_retreat` before recovery and resumption. Injured or visibly threatened
bots do not leave shelter through this new food-trip condition. No health,
hunger, items, terrain or success criteria are granted or altered.

All 395 JavaScript tests passed, including food-17 recovery choices, safe raw
food selection, threat/health guards and the forage/return/recover/resume chain.
The accompanying plot-return fix also passed a native survival fixture.
Only the bot controller was reloaded; all eight bots reconnected and automatic
Night 3 learning resumed at the same site with a fresh comparison. Protected
models and demonstrations were retained. Minecraft and the dashboard stayed up.

Early hostile losses before the first shelter remain unresolved. There was no
infrastructure or memory-pressure hold at this check; they should be evaluated
as survival/controller problems, not corrected by repeated service restarts.

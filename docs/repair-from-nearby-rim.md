# Repair from reachable local footing before demanding the damaged entrance

Policy baseline 707 stopped LabAI2 with `home_repair: No safe return route to
the damaged home`. The bot stood at (16463.84, 67, 16420.50), about 12.8 blocks
from its house center and four blocks above the house level. A pre-repair guard
required travel to the damaged approach before the local repair planner ran.

Read-only native inspection found 40 missing parts, no unloaded house cells,
and three reachable supported repair stances for missing foundations. The
return prerequisite discarded that existing repair path.

When the house is fully loaded and within the local planner's 24-block range,
repair now proceeds through its existing stance selection, safety checks and
material budget. A distant or unloaded house still uses the previous return
path. No entrance safety check is waived, and backfill still proceeds from
checked footing with real inventory; no supplies or lesson credit are granted.

All 682 JavaScript tests pass. New transition fixtures cover a bot four blocks
above the home and another 13 blocks away, complete a real-inventory repair,
and resume the interrupted lesson without first requesting the damaged entrance.
Existing distant/unloaded return and safe crater backfill tests still pass.
Native inspection validates available stances, not live survival completion.

Queued deployment follows comparison 325, preserving its current measurements.
The rollout must restore any unvalidated models, restart only bots, and verify
fresh connections, Minecraft/dashboard health and new comparison progress.

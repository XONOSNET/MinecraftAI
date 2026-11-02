# Natural-world staircase mining

First Night's stone lesson previously searched exposed faces and eventually
reported no reachable stone. It now commits to a bounded survival staircase
when exposed candidates are exhausted. Policy harvesting and navigation still
choose actions; the shared controller checks excavation geometry for both
baseline and candidate runs.

Each step goes one block forward and one block down. Three cleared cells give
headroom for the climb home. The original floor below each landing stays intact;
later turns cannot remove any recorded stair support. Six-step runs turn to
limit the footprint. The bot records and climbs its stairs back to the entrance
before receiving quarry credit. Existing requirements still demand 16 real
cobblestone. No underground blocks, tools or ores are generated for production.

The mine avoids houses, other players/miners, trial boundaries, unloaded cells,
unsupported cave floors, water, lava and falling materials. It examines blocks
before and after each excavation. If water reaches the working section, digging
stops, the bot seeks a verified dry return landing, marks the wet branch and
tries another direction. Water that cuts off every verified exit causes an
explicit failure instead of blind excavation or a fabricated safe route.

Exposed nearby coal is mined opportunistically, without removing a stair floor.
Carried coal/charcoal and sticks produce actual torches; side-wall placement is
verified every four steps when materials are available. Front-wall mounts are
avoided because the next excavation would destroy them. Without supplies the
mine returns after at most ten unlit steps. It does not claim coal is guaranteed
or dig indefinitely while hoping to find it. Existing surface exploration and
charcoal progression remain available.

`config/mining.json` contains explicit controller geology guidance: early stone
is sought within a 16-block descent; coal stays above Y=0 with preference for
high terrain near Y=96; underground iron guidance targets Y=16 and requires a
stone pickaxe. This follows Mojang's
[ore-distribution notes](https://feedback.minecraft.net/hc/en-us/articles/4415128577293-Minecraft-Java-Edition-1-18).
These are search priors, not hidden-ore coordinates. This update connects the
new staircase to First Night's **stone** lesson; it does not add an iron lesson
or replace the separate prepared iron-age curriculum. Encountered iron is
preserved when the carried pickaxe cannot harvest it.

The status report exposes mine stage, target height, depth, coal, torch counts
and abandoned wet branches. General health, hunger, hostile assessment and trial
limits remain active. A related fix lets sealed-refuge validation run before a
generic stationary timeout; stopped bots no longer report themselves as safely
sealed merely because they once placed a roof.

Validation includes full-trip stair/floor preservation, exposed coal and actual
torch-placement decisions, water rerouting, private plots, players, fluids,
falling materials and unlit limits. `scripts/verify_staircase_mining_native.cjs`
uses an isolated originally empty sky fixture and diagnostic tools. It exercises
real survival digging, server-authoritative crafting, placement, descent and
ascent, then removes the fixture and diagnostic items. It bypasses policy action
selection to test physical execution; it is not a production learning score.

# Mining direction and depth

The staircase miner supports `stone`, `coal` and `iron` objectives. Depth is a
search prior, not knowledge of hidden ore locations. It prioritizes reachable,
visible ore and follows newly exposed vein blocks before extending excavation.
Iron requires a stone pickaxe or better; cobblestone cannot satisfy an iron or
coal quota. Nearby coal can also supply lighting on a stone trip.

* Stone: bounded staircase for the current First Night stone requirement.
* Coal: Y96 is the preferred band. Below it, seek a rock face near the entry's
  elevation rather than repeatedly descending. Above it, descend toward that
  band, then prospect horizontally.
* Iron: descend toward Y16, then prospect horizontally. Exposed iron can be
  collected sooner with the appropriate tool.

Water, falling blocks, house plots, other players and recorded stair supports
remain protected. Darkness, available supplies and excavation budgets still
limit a trip; knowing an ore's preferred depth does not permit bypassing them.
Vein harvesting reads visible faces only, with ordinary reach and inventory.

These bands follow [Mojang's ore distribution notes](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java).
They are probabilities, not guaranteed ore at a coordinate.

## Current lesson integration

First Night currently requests **stone**, with opportunistic coal and, when
equipped appropriately, exposed iron. The later prepared iron lessons still
use their assigned ore sites; they do not yet request this miner's open-world
iron objective. Dedicated coal/iron expeditions and progression beyond iron
need curriculum integration. The user's diamond, redstone, gold, copper,
lapis, emerald and Netherite notes are useful future priors, not enabled tasks.

Mining telemetry includes the resource, target Y, current strategy and exposed
ore target. The native verification script uses a disposable sky fixture,
checks actual collected coal, and removes its blocks, drops and test supplies.

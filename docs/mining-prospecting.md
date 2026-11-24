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

## Stone mining prerequisite recovery

Trials 1124 and 1126 ended LabAI5's last reported mine at six steps with no
suitable pickaxe. Trial 1134 ended LabAI6's last reported mine at ten steps
for torch supplies. The reports ran controller `0b6d4c319c049d96`. They recorded
no torch placements or collected coal for those mines. Trials 1124 and 1134
eventually completed the lesson. Trial 1126 stopped. The final reports retain
the last mine and lack the inventory and durability history of each earlier
return.

Earth excavation now selects a shovel or an item without durability, or frees
the hand through a verified inventory operation. A wooden pick can therefore
serve its rock objective. A full inventory containing only tools refuses the
earth dig until a safe inventory action is possible.

An insufficient stone trip that returned for tools, torches, or a safety
interruption keeps its recorded stairs. Tool recovery uses the home workbench
and ordinary recipes. Lighting recovery can spend the first eight collected
cobblestone on a furnace, smelt real logs into charcoal, and prepare eight
torches before returning. The stone quota is still based on the cobblestone
actually carried after these costs. If neither coal nor furnace materials are
available, the bot reports the missing prerequisite and ends the attempt at
the existing darkness limit.

A deep-mine return checks both tool and torch supplies even when the original
return reason names only one prerequisite. A shallower tool return can resume
within the original unlit allowance, so obtaining the first furnace stone does
not depend on already owning a furnace. Furnace placement retains its checked
alternate stance across controller ticks.

Each mine allows at most three resumptions. The route must belong to the same
bot and run. Every loaded stair, support, return headroom, boundary, nearby
player, and fluid envelope is rechecked before reuse. Revisited stairs receive
ordinary lighting checks, and removed torches grant no lighting credit. Flooded,
unsafe, exhausted, or obstructed mines retain their refusal behavior. Recovery
progress appears in the normal activity message and `wilderness.mining_recovery`.

```powershell
git archive --output=logs/mining-recovery-baseline.zip 658c3c2 controller config
Expand-Archive logs/mining-recovery-baseline.zip logs/mining-recovery-baseline
node scripts/verify_mine_recovery_native.cjs baseline --verify-source
node --test tests/resource-access.test.js tests/staircase-mining.test.js tests/stone-mine-recovery.test.js tests/tool-recovery.test.js tests/mine-cover-exit.test.js
node scripts/verify_mine_recovery_native.cjs baseline
node scripts/verify_mine_recovery_native.cjs candidate
```

The native commands require a separate loopback Paper fixture on ports 25571
and 25572. The archived baseline controller belongs under
`logs/mining-recovery-baseline/controller`. Raw native reports, fixture worlds,
and the archived source remain local. This recovery changes controller behavior.

## Native mining loop reproduction

The isolated Paper 1.21.4 baseline uses commit `658c3c2`. Its preflight verifies
all 106 controller and configuration files against Git before loading them.
Canonical LF source has SHA256
`2be9c28c8c05d859cf674dca59f05da4c5dba8f7e06bae66982c9c04ae2e5aec`.
The archive's executable byte fingerprint differs from the live Windows
checkout because of line endings.

The survival start is `[140.5, 180, 140.5]` over six dirt layers with stone at
y173 and below. Fixture stock is one wooden pickaxe with 45 damage, eight oak
logs, eight planks, and four sticks. There are no initial torches, charcoal,
coal, furnace, or cobblestone. The fixture provides a home workbench to isolate
resource recovery. Both arms use the native teacher, navigation and motor
helpers, recipes, block acknowledgements, and item collection.

The verified baseline exhausted its pick on its fourteenth dirt block and
cleared seventeen dirt blocks before withdrawing. It returned after six
stairs, carrying zero cobblestone and no pick.
The completed trip discarded its mine, and the bot physically dug and descended
a new stair at `[136, 180, 140]`. This took 38.690 seconds. The arena was cleared
and the client disconnected before the candidate started from the same setup.

Candidate controller `f399d8a9ddeca0fd` completed in 296.967 seconds. It kept
the same entrance through a torch return, a scripted safety exit, and a real
tool break. Native recipes produced a furnace, charcoal, sixteen torches, and
one replacement wooden pickaxe. The bot reached fourteen stairs, returned
grounded to the surface with sixteen cobblestone, health 20 and food 20, and
advanced to `night_fuel`. This count includes the eight cobblestone already
spent on the furnace. Changed supports, flooding, an unsafe route flag, and a
foreign owner each refused reuse. Both arms verified arena cleanup and logout;
the disposable Paper process, ports, and world were removed.

Both final arms used view distance 3, simulation distance 2, one fixture CPU,
and a 512 MiB heap. The candidate's sampled production memory was 87.9–88.5%;
Paper remained ready on PID 36160 with eight production bots. All 807 JavaScript
and 413 Python checks passed. Native results are
`logs/mine-recovery-baseline-native.json` and
`logs/mine-recovery-candidate-native.json`.

An initial candidate with four fixture logs repaired its tool but returned with
no torches on its third visit. The normal darkness guard and recovery cap then
discarded the mine, and it started another hole with six cobblestone. This
failure led to the compound supply check. The final controlled fixture gives
both arms eight logs to exercise furnace, lighting, tool replacement, and a
scripted safety interruption. Wood gathering itself retains the existing
controller path and has focused regression coverage.

Earlier native attempts were excluded after an archive mismatch was found.
One disconnected fixture remained running overnight and was removed before
verification resumed. The harness now has a process deadline, incremental
action journals, bounded disconnect checks, and source verification. A
deliberate unpublished-file probe confirmed that the source guard fails before
connecting to Paper. The failed 384 MiB startup and memory preflight attempts
are recorded separately from the verified baseline.

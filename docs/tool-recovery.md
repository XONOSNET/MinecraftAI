# Level 3 tool and task recovery

Harvesting accepts a carried upgrade instead of requiring the original wooden
tool by name. If a pickaxe is missing, the controller refreshes the inventory
and requests a replacement. Food and wool hunting also check for a usable axe
before starting another chase.

Replacement preserves the interrupted phase. The bot first exits its recorded
mine, gathers real wood if needed, returns to its home workbench, crafts handles
and a replacement, verifies the server inventory and equips it. Normal shelter,
food and combat priorities still interrupt this process. Completion restores
the original lesson and clears stale movement plans; it awards no lesson credit.
Replacement currently uses wooden tools, or a stone pickaxe when required and
cobblestone is carried. This is not an iron equipment replacement curriculum.

After shelter recovery, outdoor search and doorway approach state are refreshed.
An obstructed mine return waypoint can be skipped only if sensed terrain has a
checked reversible route to an earlier supported stair. Genuine unsafe exits
still fail. Reaching a stone approach no longer rejects the resource; failed
approaches retain the existing rejection and wider scouting behavior.

If the recorded entrance's ground height changes by one block, the return
controller can use a newly sensed landing in that same entrance column. It must
have safe supported footing and a complete reversible route. The recorded mine
history is preserved, and returning still does not award missing supplies.

Validation: JavaScript regression tests cover replacement, supply gathering,
shelter interruption, rejected crafting output, upgrade selection, mine return
and stone target retention. `scripts/verify_staircase_mining_native.cjs` uses an
isolated disposable survival fixture to verify mining, coal pickup and actual
replacement crafting, then removes its blocks, drops and diagnostic inventory.
Its supplies are never given to production bots.

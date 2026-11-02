# Repairing an earned home

After earning a hut, bots inspect nearby loaded home cells for damage. Missing
floors, walls, roof, workbench and door make the home unsuitable for retreat.
Earned beds, chests, furnaces and wall torches are also checked; unearned
furnishings are not added by the repair controller.

Repairs salvage reachable drops, gather actual wood, mine cobblestone or collect
wool when needed, craft replacements and place them from supported work stances.
The controller bridges the checked foundation perimeter and repairs floors
before the shell and furnishings. It refuses fluids, occupied work cells and
removing a floor beneath a player. Unknown or unloaded cells do not prove damage.
A repaired bed re-registers home; a previously stocked replacement chest receives
eight real planks. Lost chest contents are not recreated. Repairs award no new
lesson milestones and resume the interrupted task after physical verification.

Safety decisions still take priority over repairs. This is recovery from checked
blueprint damage, not a guarantee of recovery from every crater or inaccessible
site. The native fixture verifies foundation/floor, shell, workbench and door
recovery using real survival crafting and placement, with fixture-only materials.
Unit checks additionally cover furnishing recipes, bed registration, chest
restocking, actual supply shortages and player/fluid guards. Fixture terrain and
drops are cleaned afterward.

Controller updates can be queued with
`scripts/deploy_controller_after_comparison.py round:197` (replace the round).
The bounded helper waits for that comparison to finish and the following terrain
preparation boundary, restores unvalidated weights, reloads only bots and starts
a fresh comparison at the saved site/support level. Source edits or an
intentional pause cancel the queued update. It never restarts a live attempt.

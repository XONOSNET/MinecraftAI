# Restore a missing workbench before continuing walls

Policy trial 698 stopped with `build: Construction cell contains birch_planks`.
Inspection found a definite recovery flaw: the workbench belongs to the wall
blueprint, but the generic build loop places planks for any missing cell.
If the workbench disappears during interrupted construction, the loop can
fill its slot with wood and then reject that wood on its next pass. The stop
report lacks target coordinates, so this mechanism is not proven to explain
every occupied-cell failure.

The construction supply handoff now restores an empty workbench slot first.
It gathers missing real wood through the existing supply trip, crafts a table
with the inventory recipe if needed, and uses checked station placement.
It retains the build phase and all existing house blocks. A carried table
is handled even when no additional wood is needed. An occupied unrelated
slot is preserved; this does not grant permission to demolish player work.

All 678 JavaScript tests pass. Transition fixtures cover missing table,
crafting, shelter interruption, native placement handoff and continued wall
work, plus inventory reuse and preservation of an occupied slot.

Queued rollout follows comparison 320, restoring any unvalidated candidate
before bot-only restart and verifying a fresh same-controller comparison.
Do not treat the source as live until the rollout report verifies it.
The missing-dirt burrow failure and the teacher's separate stationary build
failure remain unresolved and are not claimed fixed by this change.

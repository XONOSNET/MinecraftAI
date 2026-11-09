# Resume initial workbench placement after sheltering

OakToad stopped in the `table` phase in trials 759 and 762 because no carried
crafting table remained after an intervening shelter trip. The replacement
material routine previously handled `build`, but not this earlier phase.

The same recovery now handles a missing table during initial placement. It
converts real carried logs, crafts a replacement from four real planks, or
uses the existing gathering and return flow when supplies are insufficient.
That flow remembers whether to resume `table` or `build`. A carried or already
placed table continues through the normal placement and verification path.

The regression covers missing materials, gathering, shelter interruption,
return, conversion and replacement crafting. It verifies that existing house
blocks, milestones and the original task remain intact. Starting resupply
alone does not reset the progress timestamp. No supplies or lesson credit are
granted. Live comparison results remain necessary to establish transfer.

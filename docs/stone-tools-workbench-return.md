# Return from cover before crafting stone tools

Policy candidate 700 completed 7/8 and was accepted against a 6/8 baseline.
Its only failure was `stone_tools: Crafting table did not open`. The preceding
navigation report was from a refuge near (16380.50, 67, 16433.38), while home
was near (16385.5, 66.1, 16414.5). Shelter resumed the crafting phase without
returning within workbench interaction range.

The shared workstation-return guard now covers stone_tools as well as lighting
tool preparation, smelting and cooking. It walks back into the own home and
checks table range before allowing native crafting. It preserves the task and
earned milestones; danger and committed physical actions still have priority.
It does not claim to recover destroyed tables or arbitrary window timeouts.

All 679 JavaScript tests pass. The added transition fixture covers displacement,
return, resumption, through-wall proximity rejection and shelter priority.
Rollout is queued after comparison 322. The existing deployed controller stays
in place until that boundary; fresh comparison and component health verification
are required before treating the change as live.

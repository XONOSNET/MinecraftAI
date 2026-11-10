# Prefer supported repair stances

Trial 791 left SolarSwift at a crater rim with a work target ending in
`.2, .2`. Navigation accepted the target cell, but the walking probe held at
the last approach. Repair had checked the cell center while selecting an
inward offset of 0.3 blocks, allowing the body footprint to overlap the hole.

Terrain repair now checks the actual candidate footprint for full solid support
and standing clearance. Where possible it uses the cell center instead of the
inward offset and ranks fully supported stances ahead of edge positions. The
normal reach, routing, private-plot, player, fluid and material checks remain.

This is a preference rather than a blanket prohibition on rim work: a deep
crater can require the existing edge reach when no fully supported alternative
can reach its bottom. Those difficult cases can still need separate recovery;
the change does not grant movement across an unchecked drop or mark repairs as
complete merely because a stance was selected.

A regression reproduces an unsupported inward offset with a reachable supported
alternative. The existing bottom-up crater and partial-house repair regressions
also pass. Full JavaScript suite: 716 passing. The isolated native fixture repaired all 35 missing parts, backfilled its crater,
closed the door, resumed the scout phase at full health and cleaned the fixture.
Results are saved locally in `logs/home-repair-native.json`; survival transfer
must be measured in subsequent comparisons.

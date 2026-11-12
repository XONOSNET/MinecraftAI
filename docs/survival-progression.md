# First Night survival progression

The First Night controller checks for productive work inside a verified closed house and inside a sealed emergency burrow. It uses carried items, native recipes, confirmed furnace output and the existing interaction code. Optional crafting, smelting and station placement wait until both required house lights are verified. A burrow can use a surplus torch while reserving two for the house. Workbench jobs can make stone picks, torches and incremental iron upgrades. Shield and sword take priority when affordable, followed by individual iron armor pieces and tools. Incidentally obtained armor still contributes to combat readiness.

A burrow can develop a capped work pocket or a short staircase when the loaded terrain has a solid, dry envelope. The shaft and its removable roof and lip remain the exit. Optional work yields to an observed safe daylight exit. Houses use their existing stations. A provisioned bot with a verified dawn and enough time left on the survival watch can make a bounded daylight iron prospect and resume the watch at home. Previously walked mine stairs can be checked and reused within the same attempt.

The mine reads native block light at occupied landings. The default lighting target is three, leaving a margin above the normal Overworld hostile spawn threshold of zero. The existing short excavation budget applies while light is unavailable. Spawners and hostile mobs already present require separate caution. A visible cave normally causes a bypass, with one checked threshold survey available to a well-equipped bot. Flooding prompts retreat, a seal attempt from dry footing when feasible, and route abandonment after repeated flooding. Lava prompts immediate withdrawal. [Minecraft Java Edition spawn and ore rules](https://feedback.minecraft.net/hc/en-us/articles/4415128577293-Minecraft-Java-Edition-1-18)

Combat uses the same seven actions, observations and teacher/student interface as existing lessons. Readiness weighs health, food, carried weapons, armor, shield wear, visible opponents, checked footing and earlier damage nearby. The controller can guard during a shielded ranged approach, use falling criticals on checked melee footing, and back away from an isolated creeper after a hit or during its fuse. A blocked approach or unsafe encounter returns control to the shelter planner.

The existing world report carries night survival counts and estimated activity time, equipment and mining progress, combat outcomes, and damage attribution where a native source was available. Bounded cave, flood, mine and combat observations pass through the existing memory sanitizer. Reserved assessments retain their existing memory isolation.

Settings live in `config/survival-progression.json`. Lesson criteria, support levels, and site selection retain their existing definitions. Burrow excavation depends on local cover geometry and carried supplies. House interiors use the existing blueprint, with outdoor prospect entrances for longer iron trips. Large cave expeditions and shield effectiveness against live ranged mobs still need end-to-end evaluation.

## Reproducible checks

- `node --test tests/*.test.js`
- `.venv/Scripts/python.exe -m pytest -q`
- `node scripts/verify_emergency_burrow_native.cjs --protected-work`
- `node scripts/verify_crafting_native.cjs --survival-progression`

Native checks use isolated players and temporary terrain and verify cleanup. Measure progression and survival in completed comparisons using the same controller on each side, then use reserved assessments to measure transfer.

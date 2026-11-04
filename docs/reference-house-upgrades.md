# Numbered house references for Night 4

The four user-built references at X -68..-24, Z 441..453, floor Y 225 through Y 232 are imported in `houses.json`. The numbered sign identifies the level, rather than coordinate order. The original Minecraft structures are never edited by the importer.

**Status:** reference capture and conservative offline upgrade planning are implemented. Automatic Night 4 construction is not enabled yet. The running Night 3 curriculum and its existing hut are unchanged; the current curriculum still supports levels 0–3. Do not represent the imported designs as already learned or executable by the live builder.

| House | Outline envelope | Non-air blocks | Main construction |
|---|---|---:|---|
| 1 | 7 × 7 | 62 | Compact wooden hut, bed, chest, furnace, table and two torches |
| 2 | 9 × 8 | 119 | Larger wooden house, two chests and a window |
| 3 | 11 × 10 | 206 | Cobblestone house, four chests, two windows and more lighting |
| 4 | 11 × 12 | 291 | Stone-brick house, wooden upper floor, ladder/trapdoor, six chests and three furnaces |

The envelope includes the redstone outline used for capture, not a rectangular fill instruction. Flood fill preserves the actual footprint, including its shaped corners. Capture includes blocks above outline columns, so exterior wall torches are retained. Redstone blocks, label signs directly above them, air and container contents are excluded. Other interior signs would be retained. Doors, beds, ladders, chests and wall torches retain their structural states and orientation; transient open/powered/occupied/lit states are ignored. The anchor is the lower entrance door column at floor height, so all upgrades share an entrance.

Any wood species and any bed color satisfy their respective material groups. Reference wood and bed names are preferences, not requirements. Doors and wooden trapdoors can also use another wood species. The four floor froglights in house 4 are replaced with oak planks in the imported data only, and these replacement planks also accept any wood. Upper door halves and bed heads do not count as extra inventory items. A double chest requires two chest items.

To recapture explicitly:

```powershell
node scripts/capture-house-references.cjs logs/house-reference-preview.json
```

The script uses a temporary spectator account, reads loaded blocks, writes only the requested JSON file and disconnects. It never grants the bots materials, edits the references or restarts training. Review and test a recapture before replacing the published catalog.

`planner.cjs` provides `planUpgrade`: Night 4 gating, one level at a time after a completed goal, current-inventory material deficits, retained block matching and conservative removal/placement lists. Planned salvage does not count as inventory. It refuses unloaded volume, protected neighboring plots and blocks that differ from the bot's known previous house. Chests/furnaces scheduled for removal are explicitly marked as requiring evacuation. This planner performs no world actions and grants no completion credit.

Before activating the native upgrade executor, Night 4 needs larger surveyed/reserved plots and working aisles, mixed-material crafting/smelting, verified orientation and paired-block placement, temporary construction access/scaffolding, safe evacuation and restoration of stored supplies, bed/home relocation and repair/navigation support for the larger shapes. The existing 7 × 7 hut logic and fixed furniture coordinates must not silently be applied to these references. Retain the old shelter until materials, access and fallback shelter are verified; validate every level in isolated survival fixtures before allowing automatic progression. Air exclusion is not permission to destroy unknown/player blocks occupying the intended interior.

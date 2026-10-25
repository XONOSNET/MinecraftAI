# Stage 26: enter and secure an enclosed shelter

Only Reach shelter through a doorway (stage 26) changes. Its stable name, ID, skill and catalogue position remain intact. Stage 36 is still Swimming basics 1; the other three canopy exercises retain their existing mechanics.

The old course used a freestanding roof and a distant wall opening. It now builds a seven-by-seven cabin footprint: oak-plank floor, cobblestone walls, solid stone-brick roof, glass windows and a hanging lantern. The west entrance is an actual two-block wooden door, initially closed. Training and evaluation lanes still use separate seeded layouts.

Both teacher and student receive the same entrance checkpoints and doorway motor assistance. Action 5 operates only the assigned shelter door with the existing open_practice_doors permission. The teacher opens it from outside, enters fully, closes it once clear of the door, then waits inside. Closing does not walk forward. The actuator does not allow reopening a secure shelter from inside during this objective.

Success requires a complete roof and perimeter walls, both door halves present and closed, the full player footprint within the interior, health at least 18, and two uninterrupted seconds safely inside. Opening the door, leaving the interior, or breaking the enclosure resets the hold timer. A canopy, open doorway or brief pass through the room cannot pass. It is a basic enclosed shelter, not proof of resistance to every Minecraft threat.

The shelter policy remains 82 inputs and seven actions. Two previously unused shelter observation slots now expose door interaction and interior occupancy for this stage; the sheltered feature reports verified security. Existing weights remain available, but the old canopy behavior must be retrained for this revised objective through teacher examples and normal promotion gates. Older canopy metrics cannot pass the new stage without the secure/hold measurements.

Tests cover generated walls/roof/door/light, keeping the change scoped to 26, rejection of canopy-only metrics, continuous hold reset, explicit door closing, permission checks, and stationary closing behavior. Native teacher evidence is recorded in locomotion-enclosed-shelter-teacher.json.

Final verification: 24/24 native teacher trials passed after correcting the cabin-specific entry alignment to keep moving inward when an approach point is overshot. Unchanged canopy and wooden-door neural regression tests passed 16/16. Unit checks passed 52 Python tests and 83 Node tests. Final native proof is locomotion-enclosed-shelter-confirmed-teacher.json; the two earlier 23/24 batches document the alignment issue found during development. Stalled non-secure cabin trials now reset rather than waiting through the full task budget.

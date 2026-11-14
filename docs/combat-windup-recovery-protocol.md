# Fresh critical-wind-up block after health validation

The completed or interrupted fights from previous opening studies supply no rows to this block. The [original wind-up protocol](combat-windup-protocol.md) fixes both interventions, the confirmed-hit endpoint, ambiguity handling, control, safety limits, and the minimum gain of three of 12 pairs. Use all assigned valid pairs, including openings for which the existing helper never jumps. Report both actual wind-up entry and swings attempted during a fall.

The fresh ordered start IDs are `15935999, 15582746, 15503114, 15284927, 15590828, 15025547, 15822388, 15067719, 15934023, 15317740, 15489612, 15294787`. Use `random.Random(170215).sample(range(15_000_000, 16_000_000), 12)`. Alternate existing-first and grounded-first, beginning existing-first. Use 24 fights, one fixture and inference thread, and the same 18-minute budget checked between fights. The experiment uses the original archived model and exact archived controller revision `4845ba27313939f0` in the isolated fixture source. The live controller checkout is independent of that copy.

Only launch after the same live dashboard serves the read-only `/fixture/health` contract and a low-rate paired trace covers ordinary running, terrain restoration, and a learning-phase transition. Require no narrow timeouts or invalid responses across that observed window, and no loss of lifecycle or persistence checks. An explicit unhealthy response must still stop fixture release. Native frozen-state revalidation, two 250 ms backoffs after 1.5-second timeouts, post-release stop rules, and cleanup verification are the same as before. Admin command paths still depend on the live dashboard. A setup or post-release infrastructure problem ends the block as incomplete, with no rerun of released starts.

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening --windup --fixture-health --output logs/combat-opening-windup-recovery
.venv/Scripts/python.exe -m scripts.combat_windup_evidence logs/combat-opening-windup-recovery/report.json
```

This is a development block. The reserved holdouts and production checkpoint lineage remain outside the experiment.

# Combat experience evidence · November 14, 2026

**Status:** The cleaned native smoke verifies the measurement and update path. A larger preregistered comparison is in progress. No teacher advantage, retention result or wilderness transfer is established.

The read-only production snapshot found Paper 1.21.4 ready on PID 104020, eight fresh bots, First Night wilderness level 3 on site 0, and automatic world learning at comparison 425. The student baseline was `world-1794651453090888600`; the scheduler subsequently advanced to teacher run `world-1794655410943460500`. No model restore was pending and no rollout worker was active. Seven baseline rows reported controller `4845ba27313939f0`; the stopped row omitted it. The latest rollout report was already verified. Comparison 423 was the last retained result: 5/8 completions in both arms, unsafe outcomes 2 → 1, progress 0.8375 → 0.8438. This is bundle-level imitation evidence. No controller, production settings, model checkpoint, replay or process was changed by the experiment.

| Historical batch | Wins, teacher / saved / candidate | Mean damage (HP), teacher / saved / candidate | Candidate gain against teacher / saved |
| --- | --- | --- | --- |
| Zombie 0 | 12 / 12 / 12 | 2.832 / 2.843 / 3.522 | −0.690 / −0.678 HP |
| Zombie 1 | 12 / 12 / 12 | 2.958 / 2.402 / 2.665 | +0.293 / −0.263 HP |

Source: local `logs/combat-autonomy-matched/report.json`. The 32 training fights also all won; damage ranged from 0.38 to 6.52 HP. Neither batch met the 1 HP promotion margin against either reference. There are no completed skeleton or promotion results in this historical report. Because all 72 evaluation fights won, win counts alone reveal no improvement. Damage still had headroom. Historical rows lack execution telemetry, and the old harness waited at least 1.1 seconds after issuing release before it could return a first decision. Those outcomes cannot separate policy quality from setup timing or assist effects.

The arena observes rays, relative target bearing and range, health/food, footing, sight, cooldown and equipment. It passes the seven-way proposal through the existing motor and combat helpers. Turning can also move; backing requires safe ground; guard may raise a shield; the attack helper can decline to swing, or aim and time a critical leap. An attack request is not a landed hit. The native fixture now records control ticks, displacement and yaw, helper acceptance, requests, confirmed native target-hurt events and gross damage. Packets can arrive in a later decision window. These are diagnostics, not extra policy inputs.

In production, `survival_defense.js` also selects whether to fight, retreat or seek cover, and can override creeper spacing, alignment or shield use after `/step`. That endpoint records the proposal and reward before those overrides; this defense loop supplies reward zero. The production world trainer uses cross-entropy on fresh teacher labels mixed with saved replay, and protects bundle weights and optimizers during comparison. The local benchmark bypasses that trainer and learns from actual fight outcomes. An arena gain would not establish survival transfer.

## Native smoke

Two unscored starts were stopped and cleaned:

- `combat-experience-v1-smoke`: native difficulty was unverified; no fight started. The fixture now verifies it with a read-only query.
- `combat-experience-v1-smoke-retry`: training zombie 1004930 drifted before the first action; no outcome was scored. The release acknowledgment took 442 ms. The final protocol chooses the first action with the mob frozen, sends unfreeze before initiating that action on the same connection, and verifies the native release.

| Completed smoke start | Arm | Result | Damage (HP) | Proposals | Attack requests / native target-hurt packets |
| --- | --- | --- | --- | --- | --- |
| Zombie 1004930 | Exploring candidate, training only | Win | 5.14 | 39 | 2 / 2 |
| Shielded skeleton 4307317 | Frozen teacher | Win | 1.76 | 34 | 4 / 2 |
| Shielded skeleton 4307317 | Frozen saved | Win | 2.64 | 31 | 2 / 1 |
| Shielded skeleton 4307317 | Reloaded candidate | Win | 1.76 | 31 | 2 / 2 |

No deaths, escapes or invalid starts in the final smoke. The saved tensor fingerprint was `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6`; after one outcome update it was `37d366cbda66ac1e4ecac3d226a7d940922c3d5a04c480d5216252c4817247a8`. Reload preserved the candidate fingerprint and exact logits on the observed training states, and the skeleton arm used that reloaded checkpoint. Cleanup verified blocks, entities, fixture inventory and privilege removal. The single skeleton start cannot establish an advantage or pass the full sentinel.

## Reproduce and inspect

Use new output directories for a new attempt. Do not run a second fixture while the arena lease is held.

```powershell
node --test tests/*.test.js
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m scripts.combat_autonomy --smoke --seed 70201 --output logs/combat-experience-v1-smoke-frozen
.venv/Scripts/python.exe -m scripts.combat_autonomy --protocol v1 --seed 70202 --output logs/combat-experience-v1-full --retention-cycles 2
.venv/Scripts/python.exe -m scripts.combat_evidence logs/combat-experience-v1-full/report.json --per-start
```

The local full-run report records the ordered seeds, frozen source and tensor hashes, each completed attempt, exclusions and gates; `decisions.jsonl` retains the raw observed transitions. Paper TPS/MSPT were unavailable in the smoke snapshots. The server PID and readiness, RAM, and available timing metadata are sampled across encounters. Do not publish the raw logs or checkpoints.

**Next decision:** Apply the frozen gates to the first complete 12-start zombie batch. If the candidate fails either comparison, stop before spending the remaining holdouts. If the run aborts instead, use its invalid-start evidence to fix that cause before running a new matched block.

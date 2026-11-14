# Combat experience evidence · November 14, 2026

**Status:** The cleaned native smoke verified measurement and the update path. The preregistered full run stopped after the first completed zombie block because the candidate failed both reference gates. No checkpoint was promoted; neither retention cycle nor wilderness transfer was run.

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

## Training attribution

The full candidate won 32/32 training fights (mean damage 3.065 HP; no deaths or escapes). All eight updates used the existing outcome recipe. The candidate checkpoint stores optimizer state and recipe, fingerprint `c38aae076e539d6e2c2f4ff4e6f476051a7ffb5f93f1c5301a3109c01112ca1a`. The saved reference remained at its original smoke fingerprint. Exact tensor identity and logits were verified after reload; held-out candidate fights use the reloaded copy.

`.venv/Scripts/python.exe -m scripts.combat_reward_audit logs/combat-experience-v1-full` replays the 1,708 training observations without opening Minecraft or using holdout outcomes. The original reward trace reproduced the exact candidate fingerprint. Zeroing every reward, while leaving the reference KL term and optimizer schedule in place, produced different tensors. On those same training observations, argmax changed on 12 rows for the actual update and two rows for the zero-reward control. The two updated policies differed on 10 rows (0.59%). This shows that rewards contributed to decisions on training observations, and that tensor changes alone are insufficient evidence of useful learning. The replay control did not fight in the holdout.

## First held-out block: negative result

The command above (seed 70202) finished 68 encounters without exclusions: 32 training fights and 36 evaluation fights across 12 matched starts. Each arm won 12/12, with no deaths, escapes or timeouts. No backing control was consumed in any of the three arms; the arena has no separate retreat objective. Snapshot RAM ranged from 78.0% to 83.4%, with no PID change. The native fixture acknowledged cleanup and exited; no deployment or fixture worker remained. Production still reported eight bots on PID 104020, comparison 425 demonstrating under the same wilderness options, no restore pending and an empty persistence queue at the closing check.

| Held-out arm | Wins | Mean damage (HP) | Proposals 0 / 1 / 2 / 3 / 4 / 5 / 6 | Forward ticks | Attack requests / native target-hurt packets |
| --- | ---: | ---: | --- | ---: | --- |
| Teacher | 12/12 | 2.645 | 175 / 228 / 169 / 0 / 22 / 0 / 30 | 530 | 29 / 19 |
| Saved | 12/12 | 1.923 | 177 / 157 / 270 / 0 / 26 / 0 / 29 | 540 | 29 / 24 |
| Candidate | 12/12 | 2.947 | 183 / 125 / 174 / 0 / 35 / 0 / 30 | 502 | 29 / 25 |

Codes 0–6 are approach, aim left, aim right, back, guard/wait, equip and attack. The same number of attack requests does not explain damage differences, and the hurt counts are arrivals inside traced decision windows. This table does not identify causal effects of individual actions.

| Ordered matched start | Teacher damage | Saved damage | Candidate damage |
| ---: | ---: | ---: | ---: |
| 2297597 | 4.14 | 2.76 | 4.14 |
| 2215995 | 2.76 | 1.38 | 4.14 |
| 2953246 | 1.38 | 2.76 | 2.76 |
| 2244935 | 5.52 | 4.14 | 2.76 |
| 2692352 | 1.38 | 1.38 | 2.76 |
| 2899672 | 1.76 | 1.38 | 4.26 |
| 2130025 | 1.38 | 1.38 | 3.26 |
| 2652405 | 1.38 | 3.76 | 1.38 |
| 2182105 | 3.26 | 0.00 | 4.76 |
| 2892836 | 2.76 | 1.38 | 3.76 |
| 2856988 | 2.76 | 1.38 | 1.38 |
| 2273874 | 3.26 | 1.38 | 0.00 |

Gain (reference minus candidate) was **−0.302 HP vs teacher** and **−1.023 HP vs saved**, with 3 better / 2 tied / 7 worse for each pairing. Descriptive paired-bootstrap 95% ranges were [−1.263, +0.753] and [−2.130, +0.115]; nominal one-sided sign p = 0.945 for both. These intervals do not account for dependence between encounters on one server. Only two shared wins per reference were equivalent in damage, and the candidate was faster on one and slower on the other in both pairings. There is no reliable speed advantage to claim. Matching geometry and verified player loadout does not synchronize mob behavior, hidden spawn attributes or server timing. Observed opponent equipment was empty in all 36 held-out fights.

The predeclared futility rule fired. The second zombie block and 12-start skeleton sentinel were not used, the candidate remains a local diagnostic checkpoint, and the original saved model remains the reference. No production model rollback was needed because no production model was installed. Neither of the two later cycles has a qualifying champion to test. Wilderness transfer remains untested.

**Next decision:** On disjoint training-only starts, test whether matching the reference KL temperature to the exploration distribution produces a reward-dependent change in *executed* spacing or guarding at equal safety. Use the same frozen reference, a matched zero-reward control, and the current recipe as controls. Only preregister new holdouts if this changes behavior beyond the tiny observed training-state argmax shift; do not tune against the used block.

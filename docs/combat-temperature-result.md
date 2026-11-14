# Combat temperature ablation result

The [predeclared screen](combat-temperature-protocol.md) failed. Matching the reference penalty's temperature changed **zero of 1,708 greedy decisions** between the two real-reward arms. No new Minecraft fights were run, no holdout was preregistered, and the unused v1 evaluation blocks remain sealed. Production was neither paused nor changed.

## Replay

```powershell
.venv/Scripts/python.exe -m scripts.combat_temperature_ablation logs/combat-experience-v1-full > logs/combat-temperature-ablation-v1.json
```

The command reads the 32 archived training fights in their recorded order, stopping before any evaluation decisions. Each arm uses the same original policy, optimizer initialization, observations, sampled proposals and update schedule. The only factors are the temperature applied to the frozen reference before the penalty's softmax (1.0 or 1.2) and the reward stream (observed or zero). None of the four policies was installed or used in live combat. The original real-reward replay exactly reproduced the saved experiment candidate, tensor SHA-256 `c38aae076e539d6e2c2f4ff4e6f476051a7ffb5f93f1c5301a3109c01112ca1a`. The script reports all four hashes, exact action counts, subgroup transitions and first-hit findings by training seed.

| Archive decision subset | Rows | Original real vs zero: changed | Matched real vs zero: changed | Matched real vs original real: changed |
| --- | ---: | ---: | ---: | ---: |
| All | 1,708 | 10 | 9 | **0** |
| Visible, equipped, ≤3 blocks | 1,177 | 6 | 6 | 0 |
| Aligned and cooling down (primary) | 127 | 3 | 2 | 0 |
| Aligned, >400 ms cooldown | 80 | 2 | 2 | 0 |
| Aligned, ≤400 ms positive cooldown, ≤2.7 blocks | 32 | 1 | 0 | 0 |
| Aligned and attack ready | 97 | 0 | 1 | 0 |

Both real-reward arms chose 98 waits, five right turns and 24 approaches on the 127 primary opportunities. Backing was never preferred. Matching temperatures added zero protective choices beyond the three controls (required ≥13 net decisions and ≥4 fights). Both real-reward arms retained 79/97 aligned attack-ready proposals, so the attack-preservation check alone passed. In the primary window the real rewards moved two matched-recipe choices from wait to turn, versus three under the original recipe. The overall temperature effect on sampled action probabilities was also small: mean total variation 0.0000618 and maximum 0.00641, both measured at exploration temperature 1.2. Zero-reward arms were updated controls whose tensors did drift, including at matched temperature; the immutable saved policy is the no-update reference. None of these off-policy comparisons demonstrates a change in executed spacing, guarding or damage.

## What happened before the first hit

Thirty of the 32 archived training fights took damage. Use cumulative damage deltas reconstructed from the logged reward, validated against terminal damage, to include hits between execution windows; one fight's first damage interval would otherwise be missed or shifted.

| First observed player damage relative to | Earlier | Same interval | Later | Event not observed |
| --- | ---: | ---: | ---: | ---: |
| First attack proposal | 17 | 11 | 2 | 0 |
| First attack request | 19 | 9 | 2 | 0 |
| First native target-hurt packet | 19 | 8 | 1 | 2 |

- **Potential opening, before the damage interval:** 28/30 injured fights already had a visible target within three blocks, weapon equipped, and cooldown zero. The trace has 268 such decision windows; the median lead from the first was four windows, or 417 ms summed across recorded execution windows.
- **Also aligned to the teacher's 0.12-rad cutoff:** only 8/30 had an earlier opportunity (nine windows); another 10 met it only in the damage interval. The actual attack helper can re-aim and does not impose that teacher angle cutoff, but reach or sight may change, and a critical wind-up can still delay or veto a swing.
- **What executed:** of the 268 broadly eligible windows, the archived exploratory policy proposed 260 turns, six approaches and two attacks. The fixture observed two attack requests, 97 forward-control ticks, 524 lateral-control ticks and zero back ticks in those windows. Action 4 in this unshielded zombie loadout would be waiting. Same-window ordering, network gaps and missing hurt packets limit causal interpretation; an earlier attack was possible at the observation, not proven to land or prevent damage.

**Decision:** Stop temperature tuning. If a further training-only study is wanted, test the opening decision directly: compare the frozen policy with a narrowly gated attack proposal at the first visible, equipped, in-reach, cooldown-ready observation, leaving the shared re-aim, reach, sight and cooldown checks intact. Measure request-to-hurt timing and first-hit damage before considering a new holdout. The current trace points to opening timing and action choice, not a shortage of broadly eligible observations.

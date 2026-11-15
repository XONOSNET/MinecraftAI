# Critical wind-up · memory-headroom retry

This is the single retry of the [sealed 12-pair protocol](combat-windup-recovery-protocol.md). The [previous attempt](combat-windup-recovery-result.md) stopped before the first reset and contributed no encounters. The retry used the same order, archived controller revision `4845ba27313939f0`, original saved tensor fingerprint `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6`, narrow health reader, 86% memory limit, and scoring gate.

Before the retry, five read-only samples at 12-second intervals showed the same ready Paper PID `36160`, eight fresh production bots, zero persistence errors, and RAM between 73.4% and 73.5%. Production was in ordinary play during round 436 teacher demonstrations. The fixture ran once with a separate output directory to preserve the initial attempt.

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening --windup --fixture-health --output logs/combat-opening-windup-retry
.venv/Scripts/python.exe -m scripts.combat_windup_evidence logs/combat-opening-windup-retry/report.json
```

## Completed matched block

All 24 fights ran in the preregistered order. Each narrow frozen-state check received a response on the first attempt. Per-fight preflight RAM ranged from 72.6% to 73.4%. Native release was confirmed for every fight. The journal matches the frozen source and terminal rows. Both arms shared matched native start geometry, full health, food and saturation, and the same iron loadout. Each selected attack at the first grounded eligible observation, then resumed the saved policy. The frozen model fingerprint was unchanged after the run. There were no invalid or interrupted trials.

| Outcome | Existing helper | Grounded opening |
| --- | ---: | ---: |
| Confirmed bot-first hits | 7/12 | 8/12 |
| Ambiguous | 3 | 0 |
| Bot took damage first | 2 | 4 |
| Total HP lost | 21.70 | 23.82 |
| Mean HP lost per fight | 1.81 | 1.98 |
| Wins | 12 | 12 |
| Deaths | 0 | 0 |
| Escapes | 0 | 0 |
| Opening wind-up entries | 4 | 0 |
| Opening swings during a fall | 4 | 0 |

**The grounded opening failed the gate.** Giving the existing helper the benefit of ambiguous outcomes yielded a conservative gain of −2/12, with two better pairs, six ties and four worse pairs. The required gain was +3/12. The grounded arm also took 2.12 more HP across 12 fights, failing the mean-damage criterion. The existing arm's ambiguous results were two wins missing an owned-target hurt packet and one case inside the 50 ms window.

`H` means confirmed bot first, `A` ambiguous, and `D` damage to the bot first. Each cell gives the classification and the total HP lost. Both arms won every start. The wind-up column identifies what the existing helper actually did.

| Start | First arm | Existing helper | Grounded opening | Existing wind-up |
| --- | --- | --- | --- | --- |
| `15935999` | Existing | H, 0.00 | D, 1.38 | No |
| `15582746` | Grounded | H, 2.76 | H, 3.76 | No |
| `15503114` | Existing | H, 1.38 | H, 2.38 | No |
| `15284927` | Grounded | H, 0.00 | H, 0.00 | No |
| `15590828` | Existing | A, 0.00 | D, 2.38 | No |
| `15025547` | Grounded | H, 0.00 | H, 0.00 | Yes |
| `15822388` | Existing | A, 3.76 | H, 1.38 | No |
| `15067719` | Grounded | D, 2.76 | H, 4.26 | Yes |
| `15934023` | Existing | H, 1.38 | D, 1.38 | No |
| `15317740` | Grounded | A, 4.14 | D, 4.14 | Yes |
| `15489612` | Existing | H, 2.76 | H, 2.76 | No |
| `15294787` | Grounded | D, 2.76 | H, 0.00 | Yes |

## Opening trace and next decision

- Every opening proposal in both arms reached the native attack request, with zero footing vetoes or helper refusals. The four existing wind-ups produced falling swings 411.5–446.5 ms after proposal. Two swung after the bot took damage (`15067719`, `15294787`), one traded within the ambiguity window (`15317740`), and one hit first without taking damage (`15025547`). Their matched grounded fights had three confirmed first hits and one damage-first result. This split is descriptive because wind-up entry is observed after assignment.
- Every grounded proposal requested a swing within 0.67 ms and before any observed damage. Seven had a corroborating target hurt with just the opening request before it. Five only showed a first target hurt after competing requests, including all four damage-first results. This trace cannot distinguish a request that failed to deal damage from a missing receipt before a later request.
- Preserve the existing helper. Before fitting another policy or spending an evaluation holdout, capture the owned zombie's native health changes alongside hurt packets and attack requests. The immediate grounded swing removed the delay and still left opening-hit attribution unresolved in five fights. A health trace can test whether those requests reduced target HP.

The fixture verified arena and inventory cleanup. The lease was released, the fixture account disconnected, and native and dashboard operator checks showed it deopped. After the run, Paper PID `36160` was ready with eight fresh bots and round 436 demonstrations still running. The reserved holdouts and production checkpoints were untouched. No opening policy was fitted.

The local headroom log `logs/combat-windup-retry-headroom.jsonl` has SHA-256 `78f5735e0da5846e1c2271e3dd506a3a65b2f0c33c429e1947349ecfe2e917c4`. The retry `report.json` hash is `3793116848147db56ffc807f47c0d618adc3f3ad901cc778d2143fa65b691b65`. The adjacent decisions journal hash is `7085879607db5f3ce2b06d7090946504bfeb6ed870b044a6585c2a736a57fea1`. Rerunning the analyzer reproduced the saved scores, and each encounter's gross damage reconciled to the event journal.

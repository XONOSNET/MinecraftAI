# Critical wind-up after live health validation

This record uses the [fresh 12-pair protocol](combat-windup-recovery-protocol.md) and the [original scoring and safety gate](combat-windup-protocol.md). Earlier opening studies remain separate. The treatment changes only the first eligible grounded attack's critical wind-up. Both arms use the same frozen saved policy and return to it immediately afterward.

The live route and combat block can be reproduced from the project root:

```powershell
node scripts/probe_dashboard_status.cjs logs/dashboard-status-live-validated.jsonl 10 720 --fixture-health
.venv/Scripts/python.exe -m scripts.summarize_dashboard_status logs/dashboard-status-live-validated.jsonl
.venv/Scripts/python.exe -m scripts.combat_opening --windup --fixture-health --output logs/combat-opening-windup-recovery
.venv/Scripts/python.exe -m scripts.combat_windup_evidence logs/combat-opening-windup-recovery/report.json
```

The 10-second probe runs both existing dashboard requests and the new narrow request simultaneously. Inspect `world_phase`, `learning_phase`, owned PID, `persistence`, response code, `contract_matches`, sample age, and `health_rejection` before starting any fixture. A current sample that explicitly declares the server unhealthy remains valid evidence about the route and must veto release. Raw observations remain in the local ignored logs.

## Live health validation

The same live loopback dashboard listener (PID `72136`) and Paper process (`36160`) served the validation from 06:06:37 to 06:38:58 UTC on November 15, 2026. The continuous trace included 148 running samples in round 435 evaluation, one finished evaluation, one cooldown sample, 40 samples during round 436 baseline restoration, and three running baseline samples after restoration finished. The narrow route gave 193 well-formed responses, with no timeouts, invalid responses, stale samples, or missing persistence state. There were no production actions to induce a transition.

| Route | Completed | Timeouts | Median observed | Maximum observed |
| --- | ---: | ---: | ---: | ---: |
| `/fixture/health` | 193 | 0 | 7.4 ms | 1017.2 ms |
| `/status?compact=true` | 187 | 6 | 45.4 ms | 1517.5 ms |
| `/brain/data` | 193 | 0 | 6.8 ms | 1016.9 ms |

The full-status timing column includes the locally observed abort delays. At 06:31:42 UTC, full status timed out while the narrow route returned a current cooldown sample in 9.4 ms. At the start of restoration, both dashboard routes agreed that zero production bot heartbeats were fresh. The narrow response remained current with valid persisted-health fields and correctly rejected release. After restoration, eight heartbeats and clear persistence were verified before launching. The completed live trace SHA-256 is `01c5b3965fd74086e5ddc254206cb3dbce019290f016ee4125a05e8b02054ede`.

## Native block · incomplete before the first fight

Initial health passed at 06:39:24 UTC in round 436 baseline. Paper PID `36160` was ready, all eight bot heartbeats were fresh, RAM was 85.8% and persistence had two pending writes with no error. The runner verified the saved tensor fingerprint `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6`, and the native fixture reported Normal 1.21.4 and controller revision `4845ba27313939f0`.

After arena setup, the runner's first per-fight health check rejected the response with `Invalid, stale, or unhealthy narrow fixture status`. The exception came from checking the decoded response. The runner stopped before it sent the reset, so no zombie was summoned or released and no fresh encounter started. The original error combined several fields and retained none of their values. Initial RAM was 0.2 percentage points below the 86% limit. A transient RAM rise is plausible, and the rejected reading is unavailable. Subsequent narrow reads returned fresh, ready, idle responses with eight bot heartbeats, clear persistence, and 85.4–85.5% RAM. The preflight now includes the checked field values in a rejection record, with the same thresholds and release checks.

| Start | Existing helper | Grounded opening |
| --- | --- | --- |
| `15935999` | Preflight stopped before reset | Unrun |
| `15582746`, `15503114`, `15284927`, `15590828`, `15025547`, `15822388`, `15067719`, `15934023`, `15317740`, `15489612`, `15294787` | Unrun | Unrun |

There were zero valid fights and zero completed pairs. First-hit outcomes, damage, wins, deaths, escapes, wind-up entry and falling swings are all unobserved. The scoring and safety gates remain unevaluated. The test offers no estimate of the treatment effect.

The fixture verified native cleanup, including arena blocks, inventory and operator removal. A separate audit verified that the fixture was offline and deopped and its arena lease was available. Paper remained ready on PID `36160` with eight production bots and baseline round 436 in progress. Production checkpoints and reserved holdouts were untouched. The interrupted `report.json` hash is `59c08b32010104ce62e084e8c54afce00623058856926a45630b9948dab7fdba`. The adjacent journal was empty, consistent with stopping before a fight.

**Next decision:** At a future authorized attempt, check that production has sustained headroom below the existing 86% ceiling before allocating the fixture. Keep the stricter per-fight check and its new rejection details. All 12 starts remain unspent. The current attempt ended under the registered setup stop rule.

The [subsequent retry](combat-windup-retry-result.md) completed all 12 pairs and reports the outcome of those starts separately.

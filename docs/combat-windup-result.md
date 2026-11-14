# Opening critical wind-up results

This is the isolated training-only comparison described in the [preregistered protocol](combat-windup-protocol.md). Both arms used the archived saved policy and one attack proposal at the same first-eligible grounded opportunity. The grounded arm bypassed only the critical wind-up for that proposal. Both arms returned to the frozen model and the usual native helper afterward. The pilot and opening replication remain separate.

From the project root, with the original archive in `logs/combat-experience-v1-full/`:

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening --windup --output logs/combat-opening-windup
.venv/Scripts/python.exe -m scripts.combat_windup_evidence logs/combat-opening-windup/report.json
```

The local report records the start order, reference tensor fingerprint, frozen source, reset poses and loadouts, dashboard retries, outcomes and cleanup. The runner uses the same isolated arena lease. The JSON Lines journal records policy proposals, executed requests, observed hurt, health loss and native wind-up entry. Native target damage is confirmed by the owned-target hurt packet. Timestamps are client receipt times on a monotonic clock, relative to the mob release command, with the preregistered 50 ms ambiguity window.

## Native block · incomplete

One of 12 pairs completed, plus the grounded arm of pair two. The existing arm of `14530703` exhausted all three dashboard checks with `TimeoutError`. Each waited about 1.5 seconds, with about 250 ms between checks. The fixture log verified the zombie frozen and zero bot damage. The reset stopped before release and verified cleanup. The other ten pairs were left unused. The three earlier starts submitted a single successful native dashboard request each.

| Complete pairs only | Bot landed first | Ambiguous | Avg. gross HP lost | Wins | Deaths | Escapes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Existing helper | 1/1 | 0 | 2.76 | 1 | 0 | 0 |
| Grounded opening | 1/1 | 0 | 2.76 | 1 | 0 | 0 |

`H` means the bot landed first. The number beside it is gross HP lost. Each finished arm won. Neither arm recorded a death, escape, footing loss, helper refusal, ambiguous outcome or unattributable opening hit in the completed fights.

| Start | First arm | Existing helper | Grounded opening |
| --- | --- | --- | --- |
| 14529115 | Existing | H · 2.76 | H · 2.76 |
| 14530703 | Grounded | Invalid setup · three timeouts before release | H · 2.76 |
| 14433366 | Existing | Unrun | Unrun |
| 14510738 | Grounded | Unrun | Unrun |
| 14095068 | Existing | Unrun | Unrun |
| 14656474 | Grounded | Unrun | Unrun |
| 14594426 | Existing | Unrun | Unrun |
| 14804545 | Grounded | Unrun | Unrun |
| 14463827 | Existing | Unrun | Unrun |
| 14783290 | Grounded | Unrun | Unrun |
| 14360586 | Existing | Unrun | Unrun |
| 14121260 | Grounded | Unrun | Unrun |

| Start and arm | Proposal (ms) | Request (ms) | Target hurt (ms) | Bot HP loss (ms) | Proposal → request (ms) | Request → confirmed hurt (ms) | Actual wind-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 14529115 existing | 1628.57 | 1630.08 | 1660.99 | 5353.97 | 1.50 | 30.91 | No |
| 14529115 grounded | 1412.67 | 1413.35 | 1428.69 | 2432.68 | 0.67 | 15.34 | No |
| 14530703 grounded | 1408.13 | 1408.78 | 1426.38 | 2370.55 | 0.65 | 17.60 | No |

All three fights had an attributable opening hit, then took damage later. The only complete pair tied and the existing arm took the normal swing without a wind-up from a 2.83-block observation. Consequently even that pair supplies no direct observation of the timing trade-off. The 12-pair gate remains unevaluated. No learned opening or development test followed.

## Cleanup and provenance

The fixture reported verified arena, inventory and operator cleanup. The lease could be rebound, no fixture Node process remained, and the dashboard and `ops.json` confirmed the fixture was offline and deopped. The post-run dashboard was responsive with the same ready Paper PID `104020` and eight production bots. It showed round 428 in evaluation terrain restore. The last preflight before the timeouts showed round 428 demonstrations running at 84.7% RAM. The samples establish a concurrent production phase transition but do not diagnose why the dashboard stalled. The experiment used the original frozen tensor and the local copy reloaded after interruption with the same hash. No production model, controller, settings or holdout was written or selected by the experiment.

- Saved tensor SHA-256 `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6`, controller revision `4845ba27313939f0`.
- Raw `report.json` SHA-256 `3a03a9488305430286b33fc9da7ec9278c0b6fdbdc0ac19387c9503a8c06e257`.
- Raw `decisions.jsonl` SHA-256 `38ed5870eb17367ab81301079729a914ad71536d25ef5f22aeaed2960e3ff240`.
- Frozen `combat_trial.cjs` SHA-256 `0e06a42283c652c868aa19d60079850f945a2fcf9ba174826f104f947c4a07d8`.
- Code checks passed with 753 JavaScript and 400 Python tests. The three scored fights and the failed reset used the real native route.

**Next decision:** Measure dashboard health-check latency during ordinary production phase transitions before allocating another fresh wind-up block. A cheap read-only probe must establish that the fixture can distinguish a transient slow status response from an unhealthy server while the zombie remains frozen. Then repeat the same complete-pair gate on new starts. This interruption supplies no basis for closing the wind-up hypothesis or fitting a policy.

Separately, the prior replication left three prompt requests without attributable hits. The strongest remaining combat measurement gap is distinguishing a swing that deals no damage from a missing hurt receipt. A fixture-only trace of native zombie health metadata alongside the existing hurt events could resolve the cases with a health drop, with no extra observations supplied to the policy. That trace is a follow-up diagnostic and does not change this block's scoring.

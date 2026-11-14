# Opening attack on matched training starts

See the [protocol](combat-opening-protocol.md) for the start order, eligibility, endpoint and decision rule fixed before any native fight. Both arms used the archived saved combat specialist with the same native combat helper. The intervention could submit one attack where the saved policy would choose a different action. It then returned control to that policy, even if the helper declined.

Run from the project root on the lab machine, with the original archive available in `logs/combat-experience-v1-full/`:

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening --output logs/combat-opening-v1-native
.venv/Scripts/python.exe -m scripts.combat_opening_evidence logs/combat-opening-v1-native/report.json
```

The runner writes an atomic report and one JSON Lines journal with the observations, both proposals, effect acknowledgments and event receipts. Per-fight timing is relative to the client sending the native mob release command. The report includes the archived model fingerprint, frozen source hashes, reset poses and loadouts, and sampled server conditions. The fixed arena spans `(1487, 210, -1504)` to `(1513, 215, -1496)`, using Normal difficulty, an adult zombie, and an iron sword and iron armor with no shield. The frozen controller revision was `4845ba27313939f0`. Production had a separate bot roster and continued running.

## Native result · incomplete

Seven of the 12 planned pairs completed, plus the opening arm of pair eight. The control for `10550370` was set up with the zombie frozen, but the fixture's 1.5-second dashboard sample timed out before release. The independent preflight had been healthy at 83.9% RAM. The preregistered stop rule ended the block without a retry. The server stayed ready on PID `104020`, the dashboard responded afterward, and the eight production bots continued baseline round 428. The fixture verified cleanup and disconnected. An earlier launch failed during source copying because an absolute Windows path resolved to the source itself. That launch started no fixture and spent no starts.

| Complete pairs only | Fights | Confirmed first hit | Ambiguous | Damage first | Mean gross damage (HP) | Wins | Deaths | Escapes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen policy | 7 | 1 | 1 | 5 | 2.44 | 7 | 0 | 0 |
| One opening proposal | 7 | 5 | 1 | 1 | 1.40 | 7 | 0 | 0 |

There were three conservative gains, four ties, and zero losses in the complete pairs. Confirmed rates were 14% and 71%. Treating ambiguity most favorably for control gives a partial gain of 3/7 (+43 points). If all five missing pairs could counter that difference, the full-block conservative gain could still be as low as −2/12. The safety and improvement gate requires all 12 pairs, so the partial result did not qualify. The unpaired opening fight won with 1.38 HP damage and damage first. No policy was trained or promoted from this evidence.

### Every start

`H` confirmed target hit first, `D` player damage first, `?` ambiguous. Each completed fight below was a win. Values after the classification are total gross damage in HP. Start order and arm order follow the protocol.

| Start | Frozen policy | One opening proposal |
| --- | --- | --- |
| 10311180 | H · 1.38 | H · 3.26 |
| 10737471 | D · 2.76 | ? · 2.38 |
| 10192716 | D · 3.26 | H · 1.38 |
| 10572246 | D · 2.76 | H · 1.38 |
| 10362703 | D · 2.76 | H · 0.00 |
| 10882707 | ? · 2.76 | H · 0.00 |
| 10560339 | D · 1.38 | D · 1.38 |
| 10550370 | Invalid setup · status timeout, frozen mob | D · 1.38 |
| 10816047 | Unrun | Unrun |
| 10080307 | Unrun | Unrun |
| 10330461 | Unrun | Unrun |
| 10637136 | Unrun | Unrun |

### Proposal, request, confirmation and damage

All eight intervention fights replaced a different saved proposal (three approaches, four left turns, one right turn). There were **zero helper refusals** and eight attack requests. All proposals arrived before any damage. Seven requests followed the proposal within 1 ms. The only critical opening, `10737471`, started at 2.36 blocks and took 426 ms to request the swing. The bot lost HP during the wind-up, 23 ms before request and 30 ms before target hurt. The primary classifies that order as ambiguous. The frozen control win on `10882707` was ambiguous because its target hurt packet was missing.

Six intervention fights had a first target hurt with only the opening request preceding it. Five were confirmed first hits. In three of those, the bot later took damage, and in two it never took damage. The two remaining opening requests went out well before damage, but their fights had no target-hurt confirmation attributable to the opening request. Additional requests preceded the first recorded hurt. The trace cannot distinguish a missed or rejected packet from a landed hit whose receipt was missing. This pattern distinguishes prompt requests that may have failed to connect from the critical wind-up case. It also shows that landing first can delay damage without preventing it over the entire fight.

| Start | Opening proposal (ms) | Opening request (ms) | First target hurt (ms) | First player HP loss (ms) |
| --- | ---: | ---: | ---: | ---: |
| 10311180 | 1509 | 1510 | 1525 | 4744 |
| 10737471 | 1399 | 1825 | 1831 | 1802 |
| 10192716 | 967 | 968 | 996 | 2729 |
| 10572246 | 1404 | 1404 | 1427 | 4286 |
| 10362703 | 1616 | 1616 | 1619 | — |
| 10882707 | 1402 | 1402 | 1434 | — |
| 10560339 | 1283 | 1284 | 2962* | 2559 |
| 10550370 | 1180 | 1181 | 4840* | 4646 |

\* Other requests preceded the first target hurt. Timing reflects rounded client receipts. Native player-hurt and HP-loss packets agreed to within 1 ms for these fights. Summed journal HP losses matched gross damage in every completed fight, including losses between decisions.

### Provenance and decision

Raw evidence remains local under `logs/combat-opening-v1-native/`. SHA-256 of `report.json` is `6103ea14591398830601b1223783ca1b298842e1b8a82e012f25e8144080190b` and of `decisions.jsonl` is `4cbc23af7b409919258fc99ee7f69ba863a972a9b7df6d20eddf5fff41523721`. Both arms loaded the same original `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6` tensor fingerprint with inference mode and no optimizer. The report's inline analysis used the initial frozen analyzer. The separate command above applies the protocol's already written native player-hurt ambiguity check to the unchanged trace and prints both input and analyzer fingerprints. It yields the same classifications for these fights.

Any inference is limited to these training starts, one server and client receipt timing. The seed fixes starting geometry and yaw while native zombie AI and server load can vary. Samples with tick telemetry reported 20 TPS and 33.3–46 ms per tick, and many timing samples were absent. No teacher comparison, retention cycles, wilderness transfer or sealed holdout was run. Code checks passed with 749 JavaScript tests and 392 Python tests.

**Next decision:** For a fresh training-only block, make the read-only server-health sample resilient to a transient timeout while the zombie is still frozen, retaining the same safety limits. Then repeat the fixed-size screen on fresh starts before fitting an opening policy. Give specific attention to the split between a prompt request without attributable confirmation and a delayed critical swing. Keep the reserved holdouts sealed.

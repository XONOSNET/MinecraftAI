# Opening attack replication results

This training-only replication uses the [fresh protocol](combat-opening-replication-protocol.md) and the original saved combat policy. The [seven pilot pairs](combat-opening-result.md) remain separate. Production bots, checkpoints, training data and the reserved evaluation blocks remain outside this experiment.

From the project root:

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening --replication --output logs/combat-opening-replication
.venv/Scripts/python.exe -m scripts.combat_opening_evidence logs/combat-opening-replication/report.json
```

The local report captures the fixed order, frozen source, original saved tensor identity, native start pose and equipment, dashboard request attempts, terminal outcomes and cleanup. The adjacent JSON Lines journal captures proposal, request, hurt and gross HP loss timing. The shared controller revision is `4845ba27313939f0`. The saved tensor fingerprint is `6b167faf6d664abf34158fe125dff337011c4679f1ef7a9fb0a179610abf30e6`.

## Fresh matched results

All 12 pairs completed in the registered order, with verified cleanup, zero invalid or interrupted starts, and the reference tensor unchanged. Each dashboard sample succeeded on the first attempt. All starts verified the same full-health/full-food iron loadout and unarmed adult zombie. The server remained on PID `104020` with eight production bots. Fixture health samples showed 81.0–84.5% RAM. Available tick samples showed 20 TPS and 39.2–41.4 ms per tick. No tick timing was available for the control starts, so timing comparisons remain descriptive.

| Arm | Bot hit first | Ambiguous | Zombie damaged bot first | Gross damage (sum, mean HP) | Wins | Deaths | Escapes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen saved | 2/12 | 3 | 7 | 30.36, 2.53 | 12 | 0 | 0 |
| One opening attack | 6/12 | 3 | 3 | 23.20, 1.93 | 12 | 0 | 0 |

Three pairs improved, seven tied, and two worsened under the preregistered ambiguity scoring. The conservative gain was one first hit out of 12 (+8.3 percentage points), below the required three (+25 points). All safety criteria passed. The raw confirmed hit-rate difference was +33.3 points. Assigning all ambiguous fights in the opposite direction bounds the gain above at +58.3 points. This ambiguity range is descriptive, with no sampling adjustment for the small sample or common server. The two arms shared start geometry and loadout, and native mob behavior could still vary. The learned head was implemented and code-tested. No fitted weights, development fights or holdout preregistration were produced because the gate failed.

`H` means a confirmed hit by the bot first. `D` means the zombie damaged the bot first. `?` means the order remains ambiguous. Each entry gives the class and total gross damage in HP. All 24 fights were wins. In odd rows control ran first, and in even rows intervention ran first.

| Start | Frozen saved | One opening attack |
| --- | --- | --- |
| 12668833 | D · 4.14 | ? · 1.38 |
| 12760363 | D · 2.76 | D · 3.76 |
| 12034427 | ? · 4.14 | H · 0.00 |
| 12100099 | H · 1.38 | H · 0.00 |
| 12057153 | ? · 1.38 | ? · 2.76 |
| 12707889 | D · 2.76 | H · 3.26 |
| 12270827 | D · 2.76 | D · 3.76 |
| 12480339 | D · 2.76 | H · 2.76 |
| 12906348 | ? · 2.76 | H · 0.00 |
| 12097883 | D · 2.76 | ? · 1.38 |
| 12074184 | H · 0.00 | D · 1.38 |
| 12094710 | D · 2.76 | H · 2.76 |

## What the trace resolves

- The first eligible observation preceded damage in all 24 fights. The intervention changed 11 proposals (seven left turns and four right turns), with one saved attack already selected. The native helper refused zero of the 12 intervention proposals.
- Six changed proposals requested a swing in under 1 ms. Five entered the native critical wind-up and requested a swing after 353–509 ms. Of those five, two requests went out after the zombie had already damaged the bot (`12760363`, `12270827`), two produced target hurt within 50 ms of bot damage (`12668833`, `12097883`), and one landed first (`12707889`). No proposed opening attack was already too late at proposal time.
- Three changed proposals sent prompt requests without a uniquely attributable first hit. For `12034427` and `12074184`, later requests preceded the first observed target hurt. `12057153` had no target-hurt packet despite a native win. Two changed proposals landed first with an attributable hit and still took damage later in the fight (`12707889`, `12480339`).
- Across both arms three ambiguous fights had no native target-hurt packet and three had hurt and health-loss receipts within 50 ms. Client receipt order cannot establish exact server hit time. Gross HP losses in the event journal reconciled with the terminal damage in every fight.

**Next decision:** Skip another training run with this intervention. First run a bounded, training-only comparison that changes only the opening critical wind-up, matching the same first-eligible attack against a fixture-only grounded swing with native re-aim, reach, sight and cooldown intact. Verify a server-confirmed hit timestamp for both, since ambiguity and the 353–509 ms wind-up were large enough to affect this gate. Preserve the existing production combat helper and holdouts.

## Reproducibility

Replication `report.json` SHA-256 is `6e015dc1b44a7d60e8e567027be8585c930ece74537e3aece58be7e6cf184048`. `decisions.jsonl` SHA-256 is `9eb8146ce2981eb4a00399070e8f05992367cb5c16823b297523203f3c0b9acb`. Its frozen `combat_trial.cjs` hash is `ba0f925d89735e003882ad06fe9f36ecb552f4aaf1b4e7dedb176ff91d9bc277`. The dashboard-independent teardown for exhausted checks was added after that copy was frozen. It runs only on frozen setup failure. Eligibility, checks, control, and event accounting during fights were unchanged.

Use two separate native fault probes. They reserve the same fixture lease, inject failures only in the fixture process, and close before sending a policy action or releasing the mob:

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening_timeout_probe exhaust
.venv/Scripts/python.exe -m scripts.combat_opening_timeout_probe recover
```

In the exhaustion probe the fixture received three timeouts while the verified zombie stayed frozen, logged zero combat events, then verified an empty arena, no fixture supplies and operator removal. The injected outage also blocked the fixture's dashboard admin requests, exercising the native cleanup path. In the recovery probe the second request succeeded. The original player and target poses and iron loadout remained intact with 20 HP, 20 food and the target frozen. The probe closed without a combat action and verified cleanup and operator removal. Both completed probes verified PID `104020`, eight production bots and an absent fixture account in the dashboard. Initial probe attempts also verified native cleanup, but one immediate external dashboard audit timed out and the other still saw the cached fixture player. The audit now checks for disconnect with a 20-second bound. The initial logs are preserved separately as `logs/combat-opening-timeout-{exhaust,recover}-first-audit.jsonl`.

Code checks passed with 752 JavaScript tests and 397 Python tests. The retry and fault probes are fixture-only. No server or dashboard restart, production changes, policy update, or reserved holdout fight took place.

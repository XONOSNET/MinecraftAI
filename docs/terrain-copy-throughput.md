# Terrain restoration throughput

## Measurement and bounded change

On November 24, completed trials 1171–1182 had a median reset of 466.6 seconds.
Copying accounted for a median 453.8 seconds; fauna and survey preparation took
about 13 seconds. An unthrottled reset still took 451.1 seconds. The existing
two-copy window therefore spends most of the reset in copy/fence round trips.

Before increasing the production default, compare two versus four 4,096-block
copies per fence in an isolated Paper fixture. Use one fixture process, a
512 MiB heap and one processor, with the arm order 2, 4, 4, 2 on the same
64 × 64 × 256 volume. All terrain slices must still be copied and individually
acknowledged. This changes the maximum window from 8,192 to 16,384 blocks;
individual clone size remains 4,096. The old 65,536-block bursts remain excluded.

Advance only if the four-copy median is at least 20% faster, every copy and
cleanup assertion passes, no fence times out, and fixture status probes have
no failures or latencies over two seconds. Production must remain ready with
the same Paper PID and eight connected bots. Abort on unhealthy production or
memory pressure. Keep partial or invalid attempts separate from valid results.

Per-tile loaded hostile removal, source/destination item sweeps before copying
and after the delayed-drop interval, exact fence matching, slow-fence fallback,
memory holds and chunk-ticket cleanup remain. Natural livestock restoration,
the final hostile/item cleanup, dawn start and checked deployment remain.

The fixture measures the copier and its tile cleanup. It does not replace a
measurement of full production restoration, which also includes fauna and
survey preparation.

## Validation capacity and maintenance plan

A read-only measurement of trial 1183 completed in 465.7 seconds. All 1,612
copies (including slow-fence fallback slices) verified across 814 fences.
All 103 Minecraft probes succeeded; median latency was 2.08 ms and maximum
702.45 ms. Paper remained ready on PID 36160 with eight bots.

The first parallel fixture did not retain its protected monster sentinel and
is invalid. The corrected fixture verified its seeded entities, then aborted
at 89.1% system memory before producing any valid timed pass. Both fixtures
were shut down, their ports closed and their worlds removed. A five-minute
follow-up found 86.0–87.1% RAM use and only 4.12–4.47 GiB available.

The next fresh block will therefore use the already-needed service maintenance
window after a completed comparison. Learning must first pause and restore any
unvalidated models; Paper must finish saving and stop. The old dashboard stays
available. A separate maintenance-only fixture health check must verify the
owned shutdown marker, paused learning, no pending model restoration, stopped
Paper identity and unchanged lifecycle state. This explicit offline mode does
not bypass unhealthy live-server checks. The same four passes, geometry,
cleanup assertions, memory limit and 20% gate apply. No previous attempt supplies
a row to this fresh block. Only a passing result permits a persisted four-copy
setting in local `data/terrain-copy-window.json`. Without that setting the
service retains two copies, including after an unexpected restart during
validation. The setting is bounded to one through four copies and loaded at
service startup. Validation output and machine-specific settings remain local.

## Completed isolated result

The fresh maintenance block completed on November 24 with copier SHA256
`1a6af768317737b68216c4b6054ac40f2114d4f2501df374880084cd96ccfb3a`.
It used Paper 1.21.4, the fixed seed 326324934, a 512 MiB heap, one processor,
Serial GC, and a 64 × 64 × 256 volume. Empty-server pausing was disabled so
normal ticks continued throughout. Monsters were enabled at normal difficulty,
with natural spawning disabled. Each pass verified its seeded 64 loose items,
16 ordinary zombies and one protected combat zombie before timing.

| Pass | Copies per fence | Copy and tile-cleanup seconds |
| --- | ---: | ---: |
| 1 | 2 | 14.266 |
| 2 | 4 | 12.266 |
| 3 | 4 | 12.318 |
| 4 | 2 | 14.437 |

The medians were 14.3515 and 12.292 seconds: **14.35% less time**, below the
preregistered 20% gate. Four-copy operation was therefore **not activated**.
No threshold was relaxed and no earlier attempt supplied a row.

Every pass acknowledged all 256 copies. Native block/NBT comparisons matched
the entire copied band. Source and destination items, including high and
embedded drops and dirty-chest contents, were clear. Ordinary zombies were
removed, the protected combat zombie remained, and all force-load tickets were
released. All 31 status probes succeeded; maximum latency was 48.971 ms.
The fixture JVM exited, both ports closed, and its world was removed.

Raw evidence is `logs/restore-throughput-native-maintenance.json`, with the
console tail beside it. Those files remain local. To reproduce the normal
isolated route when an eight-bot lab has sufficient free memory:

```powershell
.venv/Scripts/python.exe -m scripts.verify_restore_throughput --run --output logs/restore-throughput-native.json
```

The explicit offline route also accepts
`--maintenance-manifest logs/restore-throughput-maintenance.json`. It requires
the saved-Paper ownership and lifecycle proof described above; the benchmark
does not stop production itself. Completion of execution and the separate
`gate.passed` result must both be inspected before considering promotion.

## Operational recovery and live measurement

Comparison 551 finished before maintenance. The candidate service was not
activated with four-copy settings after the native gate failed. Instead, a
guarded recovery restarted the service, Paper and bots with the original
**two-copy / 8,192-block window**. The independent LAN dashboard proxy kept its
original launcher/runtime PIDs 117452/118380. Existing console, service and bot
logs were archived by rename, including the 10.697 GB console, rather than
discarded. A bounded tail-read probe of the old console had a median of
0.090 ms and maximum 6.752 ms; that probe did not identify a log-read stall.

| Same site 3, Night 3, 160 × 160 × 256 reset | Before maintenance | After recovery |
| --- | ---: | ---: |
| World trial | 1183 | 1186 |
| Complete preparation, seconds | 465.7 | 217.4 |
| Elapsed at last copy acknowledgement, seconds | 451.3 | 201.4 |
| Acknowledged copies / fences | 1,612 / 814 | 1,600 / 800 |
| Slowest observed fence, seconds | 5.685 | 0.958 |
| Minecraft status probes / failures | 103 / 0 | 35 / 0 |
| Median / maximum status latency, ms | 2.08 / 702.45 | 3.069 / 460.363 |

The earlier copy count includes fallback slices after a slow fence. Every
copy was verified in both runs. Full preparation recovered **53.3%** of its
elapsed time, with the terrain volume, lesson, site, copy setting and cleanup
rules unchanged. This is one before/after operational observation. The restart
also changed JVM/service age, memory use and logging state; dirty starting
terrain and other system activity were not frozen. It does **not** isolate
which component caused the earlier slowdown, establish a permanent fix for
long-uptime degradation, or attribute the recovery to four-copy batching.

The new Paper PID is 143464. Fresh comparison 553, trial 1186, entered running
state with eight fresh bots on unchanged controller `f399d8a9ddeca0fd`.
The active and protected model/optimizer payloads, protected checkpoint bytes,
saved replay arrays and counts, persistent names and learning options matched
across restart. The dashboard responded, persistence had no backlog or error,
and automatic learning progressed. `data/terrain-copy-window.json` remains
absent, so two-copy operation also survives subsequent restarts.

All **472 Python tests passed**, including four-copy bounds/acknowledgements,
item cleanup, slow-fence fallback, memory holds and strict maintenance-health
rejection cases. No JavaScript controller changed. Live recovery evidence is
`logs/restore-baseline-recovery.json` and `logs/restore-baseline-first-reset.json`;
the refused activation remains separately recorded in
`logs/restore-throughput-rollout.json`.

The next diagnostic decision, if restoration degrades again, is to distinguish
Python observer/lock delays from Minecraft command execution while the slow
state still exists, before another restart. The completed block does not
justify further batch-size tuning or changing the cleanup rules.

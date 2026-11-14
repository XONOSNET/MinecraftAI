# Dashboard reliability before combat fixture release

The interrupted [critical-wind-up block](combat-windup-result.md) exhausted three 1.5-second requests to `/status?compact=true` before releasing the zombie. This investigation compares that exact loopback URL, deadline and Node client with `/brain/data` on the same dashboard process. No observer or agent is requested on the lightweight route. It serves a small roster and skips the shared application lock. The two requests start together every 10 or 20 seconds, with at most one in flight to each route. Logs contain timings, response lengths, phases, and health counters, with no response bodies, tokens, or bot identities. The first collection used a body read followed immediately by JSON parsing on success. The resumed collection measures through `response.json()` like the fixture.

```powershell
node scripts/probe_dashboard_status.cjs logs/dashboard-status-diagnosis.jsonl 20 120
node scripts/probe_dashboard_status.cjs logs/dashboard-status-resumed.jsonl 10 210
node scripts/probe_dashboard_status.cjs logs/dashboard-status-transitions.jsonl 10 150
.venv/Scripts/python.exe -m scripts.summarize_dashboard_status logs/dashboard-status-diagnosis.jsonl logs/dashboard-status-resumed.jsonl logs/dashboard-status-transitions.jsonl
```

The first run was interrupted after 44 samples. The resumed run completed 210 samples. The transition run closed after 63 samples once the candidate evaluation was running following restoration. HTTP header arrival and complete local reads are recorded on the same monotonic clock. Timeouts are right-censored at the abort deadline. Phase and persistence are observed only on successful status responses. For misses their nearby successful observations or previously recorded events supply context, with no substitution for an unobserved backlog value.

The prior fixture failure occurred at `17:48:05.419–17:48:10.470 UTC`. Its preflight at `17:47:45.215 UTC` still showed production demonstrations running. The saved world history places that demonstration's end at `17:48:00.649 UTC`. Read-only SQLite events show the expedition training job first started at `17:48:17.301 UTC`, followed by gathering and combat, then the scheduled evaluation restore at `17:48:31.502 UTC` in saved world history. The exhausted checks therefore clustered in the handoff after the teacher run ended and before the first recorded training job began. The watchdog independently recorded an exhausted eight-second full-status request at `17:48:11.464 UTC`. The recorded timing makes pre-training work under the shared lock a candidate cause. It supplies no direct lock profile or contemporaneous queue depth.

## Observed production handoff

The fresh transition trace captured teacher play, its handoff, separate specialist training, and the candidate's terrain restoration without changing production. The ordinary-play samples covered teacher demonstrations in round 430 and student evaluation in round 428. On November 14 UTC:

| Request start | Trial / learning phase | Full status | Lightweight | Pending writes | Fresh bots |
| --- | --- | ---: | ---: | ---: | ---: |
| 20:19:53.288 | Running / demonstrating | 5.2 ms | 2.7 ms | 0 | 8 |
| 20:20:03.306 | Handoff before recorded training start | Timeout before headers | 256.5 ms | Unobserved | Unobserved |
| 20:20:14.825 | Paused / training | 6.1 ms | 3.2 ms | 0 | 8 |
| 20:20:24.845 | Paused / training | 66.7 ms | 6.0 ms | 0 | 8 |
| 20:20:34.921 | Restoring / evaluating, 0.5% | 34.1 ms | 12.4 ms | 0 | 0 |
| 20:20:44.962 | Restoring / evaluating, 0.7% | 45.5 ms | 5.7 ms | 0 | 8 |
| 20:20:55.018 | Restoring / evaluating, 2.5% | 5.1 ms | 2.9 ms | 0 | 8 |
| 20:27:16.982 | Restoring / evaluating, 100% | 43.0 ms | 2.4 ms | 0 | 8 |
| 20:27:27.035 | Restore-to-running handoff | Timeout before headers | 509.8 ms | Unobserved | Unobserved |
| 20:27:48.560 | Running / evaluating | 30.0 ms | 3.2 ms | 1 | 8 |

SQLite recorded the expedition job starting at `20:20:12.360`, gathering at `20:20:19.094`, combat at `20:20:22.886`, combat finishing at `20:20:26.316`, and the next world started event at `20:20:29.306`. The transition again included a full-status timeout ahead of the first recorded training start. A successful response during restoration with zero fresh bot heartbeats is a concrete example of an otherwise responsive endpoint that must block release.

| Route | Paired requests | 1.5 s timeouts | Median completed | p95 completed | Max completed |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/status?compact=true` | 317 | 10 | 47.7 ms | 359.0 ms | 1396.3 ms |
| `/brain/data` | 317 | 0 | 5.8 ms | 556.4 ms | 1176.4 ms |

All ten misses were before status response headers. Completed-latency percentiles exclude aborted requests, so the lightweight route's higher completed p95 does not imply more fixture-deadline misses. Both routes took at least 500 ms in 18 paired samples, and status alone crossed 500 ms in seven. The light route completed in 3.3–975.7 ms during the status timeouts. Completed status responses covered 217 teacher-play samples, 46 running student-evaluation samples, two training samples, and 42 restoration samples. Restoration responses had a median of 39.1 ms and maximum of 193.1 ms while the phase remained observable. Of 15 status responses taking at least 500 ms that eventually completed, 13 reported zero persistence jobs pending. The largest observed backlog was nine out of 2,048 during teacher play. This measures backlog when a response successfully captured it. Queue depth during the misses remains unknown.

## Lock and health fields

`/status` assembles and deep-copies a roughly 200 KiB dashboard response under the shared application lock. It refreshes SQLite, model and history data on a short cache, encodes after releasing the lock, then takes the lock again to publish the cached response. The same lock covers the production learning and terrain tick, including some model and persistence operations during transitions. The lightweight route uses the same HTTP server and synchronous worker pool without this lock. A fast lightweight response during a status timeout distinguishes delay on the status path from full HTTP unavailability. Slow pairs also establish that a smaller response cannot eliminate all service delays. These timings alone cannot partition lock wait, status assembly, worker contention, or other concurrency costs.

The existing lightweight route does not report a verified lifecycle PID, lifecycle busy state or persistence error. Native Minecraft ping and an OS process check omit the last two as well. The separate fixture health candidate only reads the service-owned process, the lifecycle flags under their small existing lock, readiness, eight-second roster heartbeats, RAM, persistence counters, stop marker and phase. It rejects changes in process/lifecycle during sampling. The loopback client requires the expected PID, ready and idle state, desired-running flag, eight heartbeats, RAM below 86%, explicit persistence with no errors, a valid freshness timestamp and no intentional stop. Native pose, inventory, health, mob identity, frozen state and operator checks remain separate and still run immediately before release. The client is opt-in and does not fall back to a missing or stale route. The native retry limits and post-release rules remain in place.

```powershell
.venv/Scripts/python.exe -m scripts.combat_opening_timeout_probe exhaust --fixture-health
.venv/Scripts/python.exe -m scripts.combat_opening_timeout_probe recover --fixture-health
```

Those two native checks use a contract response injected only in the fixture process, shaped from current authoritative full status for recovery. No Minecraft attack or zombie release was sent. Three simulated timeouts stopped the frozen fixture and verified arena, supplies, operator removal and disconnect even with dashboard admin calls blocked in the fixture process. One simulated timeout followed by a valid contract preserved the original reset poses, frozen mob, full health/food and iron loadout, then verified cleanup. Offline ASGI tests exercise the actual endpoint sampler and include stale/unhealthy client responses, lifecycle races, and direct loopback access. A separate Node wire test verifies the authority header and covers an aborted response body. These checks establish the contract and cleanup behavior. Live latency of the new endpoint is still unmeasured.

The current service returns 404 for the candidate. It was started without reload. Its lifespan owns the Java process and calls Minecraft stop during service shutdown. A source edit alone cannot switch the live fixture to the candidate. A planned service start is required to measure the route on real lifecycle and persistence state. Once it is available, add it as an extra simultaneous probe:

```powershell
node scripts/probe_dashboard_status.cjs logs/dashboard-status-live-narrow.jsonl 10 210 --fixture-health
```

Use a qualifying live narrow-route trace across production phases before launching the [fresh 12-pair block](combat-windup-recovery-protocol.md). No fresh combat starts were opened during the diagnosis. The reserved holdouts stayed sealed.

Local raw log SHA-256 values are `677b63f40c6ac2108bd6b8befbd35bad7118ceba3382406fad33342e607cfa6a` for the first capture, `14dce8a52d9a940aa36934b6a289c564ab29b4ef3d3529dd072c3862dd683116` for the resumed capture, and `4e85cbd5d408d90ede94302626a60630744af4b5bfacba2d014f07bd41de92db` for the transition capture. Both frozen-zombie fault probes verified the same Paper PID `104020`, a healthy production roster, and no remaining fixture account. Final code checks passed with 757 JavaScript and 413 Python tests.

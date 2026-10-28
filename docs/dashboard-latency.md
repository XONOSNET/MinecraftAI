# Dashboard latency correction

The live status route returned roughly 1.18MB on every poll, including 4,200 historical episode summaries, full historical world traces, model-training metadata and curriculum configuration. It encoded that response while holding the shared control lock. Six-client request tests measured a 447.75ms median and 515.8ms p95; a local request through the LAN HTTPS listener took 404.6ms. Recent Minecraft console timing samples reported 20 TPS.

Status polls now default to compact views: keep all live bots and current specialist details, preserve the episode results actually displayed, summarize historical world rows, and bound recent comparison/model history. Full diagnostic history remains available through `/status?compact=false`; saved data is unchanged. Compact responses are shared for 250ms, with cache hits bypassing the control lock. Mutating controls refresh with `fresh=true`. Mutable state is detached under the lock and JSON encoding happens afterward.

Post-restart testing also exposed a separate paused-mode bottleneck. Idle bot heartbeats queried the episode archive before returning a paused assignment. That path now returns before the query, and `(run,agent,id)` is indexed for real episode lookups and aggregation.

The dashboard avoids rebuilding unchanged model tables, polls less often in hidden tabs, and uses a 750ms training interval rather than 300ms. Bot startup requests use the compact route too.

Measured after deployment: 151,759-byte polls; cached sequential requests 1.7–17.3ms; six-client requests 3.0–9.2ms; uncached fresh requests 18.7–41.3ms; LAN HTTPS 4.4–26.4ms. Full-history output still contained all 4,200 episode summaries and current specialists still totaled 136,401 parameters. After resuming automatic learning, another six-client test during terrain restoration measured a 3.8ms median. These are HTTP timings on this host, not Minecraft client ping measurements; the pre-change run was active and the post-change samples were paused/restoring. Proofs are in `dashboard-latency-before.json` and `dashboard-latency-after.json`.

Validation: 261 Python tests and 260 JavaScript tests passed, including cache freshness, detached telemetry encoding outside the control lock, compact-view preservation, and paused-heartbeat query avoidance. The lab was restarted, all eight bots reconnected and automatic level-1 scenario-2 learning resumed with protected models and existing data preserved.

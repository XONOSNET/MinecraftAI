# Live control latency

The October 29 update moves routine disk work off the inference path and keeps spectator camera movement independent of dashboard and world maintenance. It adds no client mod or dependencies.

## Changes

- `lab/persistence.py` owns an ordered, bounded writer for SQLite telemetry, binary trajectories, replay archives and world snapshots. SQLite writes batch for up to 50 ms / 32 jobs. Every numeric transition remains in order. Queue saturation applies backpressure; disk failures become explicit API/log errors. Training and server operations flush queued data. Complete pending world snapshots can coalesce to the latest snapshot because that includes earlier history and all current memories; individual transitions never coalesce.
- `SkillBank` freezes replay rows and schedules archive conversion/compression instead of compressing inside `/step`. World history serialization and writing also run in the writer. Finished historical entries are immutable copies; mutable homes, templates and current memories are copied before publication.
- `/assignment` sends remembered terrain until the bot acknowledges initialization for that exact run. A reconnect starts with an empty acknowledgement and receives the memory again. Older clients still receive full memory. A measured assignment shrank from 40,872 bytes to 1,409 bytes before behavior settings, with unchanged initial memory. Direct JSON encoding avoids the framework's recursive encoder on the control path.
- The spectator camera has a separate 20 Hz worker using immutable framing snapshots and live server-relative target positions. World maintenance no longer owns its movement timing. Stop, transfer, disconnect and stale-frame handling remain. Teleport interpolation is two ticks instead of three; torso framing stays.
- Backups use a separate maintenance mutex. World-save acknowledgement reads only newly appended log bytes instead of reading the whole log. ZIP compression runs outside the bot-state lock. Server operations wait safely for an existing backup; saving is re-enabled even on failure. Minecraft's own save/clone operations can still briefly stall server ticks.
- Slow dashboard model/history/catalogue-derived information is cached for five seconds; live bot/session telemetry remains current. Explicit fresh requests bypass caches. JSON encoding remains outside the control lock.
- Moving lights update only changed cells between complete two-second cleanup sweeps. One moving bot among eight uses four commands rather than rebuilding the whole light set. Unchanged HUD properties are not resent.

## Validation and deployment

277 Python tests and 303 JavaScript tests passed. Coverage includes ordered transition preservation, bounded queue backpressure, visible disk failures and SQL rollback, snapshot isolation/coalescing, compatible replay loading, backups outside the control lock and save-on recovery, camera movement without maintenance ticks, HUD/light deduplication, and memory acknowledgement/reconnect behavior.

Learning was paused before service changes, protected models were confirmed active, queues were flushed and services restarted. A further measurement exposed repeated terrain-memory delivery, which was corrected and deployed before starting the final fresh comparison. Model fingerprints match the pre-update versions. Identities, settings, checkpoints and demonstrations were preserved. Automatic First Night learning resumed at scenario 2, size 128, support level 1, with eight fresh bots and one controller process.

## Measurements

Pre-update dashboard samples: median 87.41 ms, p95 619.88 ms, maximum 1506.93 ms. Stored bot RPC observations had median around 59 ms and occasional values near 1 second. Inference was usually under 1 ms. These RPC observations included repeated snapshots, not independent request tracing.

The initial post-update moving-bot warm sample, before the memory-delivery optimization, had dashboard median 37.86 ms / p95 138.87 ms and distinct navigation RPC median 47.5 ms / p95 143 ms. Camera-worker sampled intervals were about 45–57 ms. Cold starts and restoration still produced larger spikes. An isolated native camera probe received moving display updates about every 50 ms, with a larger gap during terrain restoration. This is not a claim that all client-visible jitter is eliminated.

Final measurements after the assignment optimization are saved in `logs/latency-final-active.json`; a diagnostic spectator probe is in `logs/latency-camera-after.json`. The reusable read-only sampler is `scripts/measure_latency.py`. `/status` now reports persistence pending/error state and camera-worker timing under `performance`.

Before/after samples use different moments and policy/teacher workloads, so they are operational checks rather than a controlled speedup benchmark. No model-learning improvement is inferred from reduced latency.

Final warm live check (20 one-second status samples):

```json
{
  "status": {
    "samples": 20,
    "median_ms": 31.14,
    "p95_ms": 304.2,
    "max_ms": 397.52
  },
  "bot_rpc": {
    "samples": 68,
    "median_ms": 20.0,
    "p95_ms": 45,
    "max_ms": 372
  },
  "camera_worker": null,
  "persistence_errors": []
}
```

All eight bots were fresh and working. The native acknowledged assignment was 2,205 bytes including behavior settings, omitted the memory as intended, and matched the active run. The persistence queue was empty with no errors. Cold-start samples still saw a dashboard spike around two seconds; these fixes do not eliminate world initialization or server-side stalls.

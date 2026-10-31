# Reduce terrain reset acknowledgement overhead

The previous safe pacing restored the full 160 × 160 × 256 region using 1,600
separate acknowledgement round trips and an additional Python tick after every
acknowledgement. A prior full reset took 354.5 seconds; the interrupted reset
was at 80% after roughly five minutes. This was sustained overhead, rather than
a hung copy command.

The copier now sends a bounded window of two clones (each at most 4,096 blocks)
with one ordered scoreboard fence. Both clone success responses must arrive
before either is counted. The next window is sent immediately after verification.
At most 8,192 blocks are queued at once, substantially below the earlier 65,536
block bursts implicated in a watchdog stall. Partial successes, missing or wrong
acknowledgements and timeouts still stop without deploying bots. The same tile
prefetch, full vertical coverage, pristine saved source, item sweeps, natural
resources, boundary walls and ticket cleanup apply.

Progress updates after each verified window, with a measured-rate time estimate.
Memory holds preserve the work as before. Status exposes both sent and verified
slice counts, batch count, limits, maximum acknowledgement duration and elapsed
time; it does not claim the queued slices have completed.

Validation: 303 Python tests pass, including two-copy partial failure, timeout,
exact fences, no unacknowledged extra work, complete vertical intervals at both
tile widths, short final windows, item cleanup and memory holds. Read-only live
measurement: `python -m scripts.measure_terrain_restore`; it records completion
and Minecraft status latency through the LAN bridge in
`logs/terrain-window-after.json`.

Live validation completed at the same site/support level and full 160 × 160 × 256
volume: **159.7 seconds** end to end, including livestock preparation, versus the
prior measured **354.5 seconds** (55% less time, about 2.2× faster). All 1,600
clones verified across 800 fences. The slowest fence took 1.239 seconds. All 41
Minecraft LAN probes succeeded, with median 3.06 ms and maximum 23.17 ms. Eight
bots were online and the fresh baseline entered its running phase. This is one
live measurement, not a guarantee against future server or memory pressure.

# Pacing terrain copies after a Minecraft watchdog stall

Historical rollout notes below describe the original one-slice pacing. The
current bounded two-slice window is documented in
[terrain-copy-window.md](terrain-copy-window.md): the 4,096-block per-command
limit remains, with at most 8,192 blocks in flight and every copy verified.

The prior Java watchdog dump placed the server thread inside CloneCommands.clone -> Level.setBlock -> ServerLevel.sendBlockUpdated. Restoration previously submitted four 64-block-high clone commands in a burst for a full-height 16-wide tile (65,536 blocks total), or a 32,768-block command for the fast-reset path. That evidence identifies the in-progress operation, not a definitive internal Minecraft failure mechanism.

Restoration now sends a single clone of at most 4,096 blocks, waits for its own successful clone response plus exact scoreboard serial acknowledgement, and yields at least 50 ms before the next slice. Tile width determines slice height; intervals cover the original vertical band without gaps or overlap. The next tile can still preload. Source/destination scope, model data, item sweeps, boundaries and chunk-ticket cleanup remain unchanged.

A stalled slice stops the restoration after the existing 20-second acknowledgement deadline without sending subsequent copies. Serial 10 cannot acknowledge serial 1. A scoreboard acknowledgement without exactly one successful clone response still fails closed before bots deploy. Session copy_stats reports sent/acknowledged commands, the block limit and maximum acknowledgement time.

Validation: all 290 Python tests passed. Tests verify both tile widths stay within 4,096 blocks; complete vertical coverage; at most one unacknowledged copy; a yield between slices; exact serial matching; and release of both current/prefetched tickets on timeout. Existing terrain and item cleanup checks still pass. A full production reset and LAN status sampling are being checked after deployment; final measurements are saved to logs/sliced-restore-after.json.

A separate system-memory pause was observed before deployment: usage was about 89% and the previous memory recovery phase waited for below 84%. No unrelated applications were stopped and no memory thresholds were changed. The standard restart loaded the change and normal automatic recovery began a fresh baseline at the saved level/site. Memory safeguards remain enabled.

Live validation completed: baseline world-1793392879338426900 restored the full 160 by 160 by 256 terrain volume in **354.5 seconds**. All **1,600 of 1,600** slice commands were acknowledged; the slowest acknowledgement was **1.732 seconds**. Across **107** Minecraft status probes through the LAN address, there were **zero failures**, with a maximum measured response time of **24.87 ms**. Minecraft remained ready, eight bots were connected and the baseline entered running state. Memory was 87.4% at completion. This slower reset is the measured cost of the smaller paced operations; one successful full reset does not establish immunity from every future server stall. Status evidence: logs/sliced-restore-after.json.

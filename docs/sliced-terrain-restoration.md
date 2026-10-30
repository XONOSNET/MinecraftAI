# Pacing terrain copies after a Minecraft watchdog stall

The prior Java watchdog dump placed the server thread inside CloneCommands.clone -> Level.setBlock -> ServerLevel.sendBlockUpdated. Restoration previously submitted four 64-block-high clone commands in a burst for a full-height 16-wide tile (65,536 blocks total), or a 32,768-block command for the fast-reset path. That evidence identifies the in-progress operation, not a definitive internal Minecraft failure mechanism.

Restoration now sends a single clone of at most 4,096 blocks, waits for its own successful clone response plus exact scoreboard serial acknowledgement, and yields at least 50 ms before the next slice. Tile width determines slice height; intervals cover the original vertical band without gaps or overlap. The next tile can still preload. Source/destination scope, model data, item sweeps, boundaries and chunk-ticket cleanup remain unchanged.

A stalled slice stops the restoration after the existing 20-second acknowledgement deadline without sending subsequent copies. Serial 10 cannot acknowledge serial 1. A scoreboard acknowledgement without exactly one successful clone response still fails closed before bots deploy. Session copy_stats reports sent/acknowledged commands, the block limit and maximum acknowledgement time.

Validation: all 290 Python tests passed. Tests verify both tile widths stay within 4,096 blocks; complete vertical coverage; at most one unacknowledged copy; a yield between slices; exact serial matching; and release of both current/prefetched tickets on timeout. Existing terrain and item cleanup checks still pass. A full production reset and LAN status sampling are being checked after deployment; final measurements are saved to logs/sliced-restore-after.json.

A separate system-memory pause was observed before deployment: usage was about 89% and the previous memory recovery phase waited for below 84%. No unrelated applications were stopped and no memory thresholds were changed. The standard restart loaded the change and normal automatic recovery began a fresh baseline at the saved level/site. Memory safeguards remain enabled.

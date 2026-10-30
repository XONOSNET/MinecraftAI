# Pipelined terrain restoration

Terrain resets now preload the next tile while the current tile loads, copies and clears dropped items. Only the current tile may issue clone commands; the next tile cannot copy until the current copy has been acknowledged and its delayed-drop sweep has completed.

The queue retains its existing ordering and progress calculation. The existing 0.8-second loading allowance is measured from each tile's actual preload time, so a warmed tile does not wait again when promoted. Full terrain coverage, clone size limits, boundaries, entity cleanup and copy acknowledgement checks are unchanged.

Only one tile is prefetched. At most four chunk tickets are owned for a normal reset, or eight for the wider fast-reset tiles. Adjacent snapshot and restore jobs sharing any source or destination chunk stay sequential. A pause, copy rejection or acknowledgement timeout releases both the current and prefetched tiles. Ownership is recorded before force-load commands so a partial command failure remains recoverable by stop().

Validation: 282 Python tests passed. Added regression checks cover warmed promotion, sequential copies, shared-chunk dependencies, bounded load count, pause cleanup and failure cleanup. Live reset measurements are recorded in logs/chunk-pipeline-after.json; the preceding full reset at the same site took 199.4 seconds. Natural server load and fauna preparation can affect total reset time.

Live validation completed: the same 160 by 160 First Night site and vertical range (-64 through 191) reset in **124.0 seconds**, versus **199.4 seconds** immediately before this change: 75.4 seconds saved, approximately 38% less elapsed time. This is one before/after observation, not a guaranteed benchmark across server loads. All eight bots were freshly connected and automatic learning was in the new baseline phase after restoration completed. The single bot controller and service logs were checked during deployment; no service or persistence errors were reported.

# Actual burrow failure footing

Burrow shaft, shell and climbing failures recur, but navigation position is
sampled while approaching the refuge. Digging, descending, knockback and pillar
placement can happen later without a new navigation sample. For example, trial
728 reports `Emergency shaft footing changed` beside an earlier surface travel
position; that sample cannot establish where the bot was when it threw.

The controller now captures the actual body position, velocity, grounded and
fluid flags, shaft centering, body/eye/floor block, cap/lip blocks and real earth
inventory count when an error occurs with an active burrow. The snapshot remains
in `wilderness.burrow.failure_context` after stopping, independently of later
telemetry. Diagnostic capture cannot mask the original failure if world access
has become unavailable. No safety decisions, timers or lesson criteria change.

The regression changes the bot pose after capture and verifies that the report
retains the terminal pose and missing floor rather than stale approach data.
It also exercises failed diagnostic access without changing phase or milestones.
All 697 JavaScript tests pass. This is evidence collection for a targeted repair,
not a claim that damaged-footing recovery itself is fixed.

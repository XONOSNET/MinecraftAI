# Recover a tracked dirt column after grass growth

Candidate trial 693 stopped LabAI3 while gathering because its tracked dirt
support at (24612, 65, 16480) had become grass_block. The report showed a
supported dry column; exact name matching classified the surface change as
an unrelated replacement. This was one of two failures in the accepted 6/8
candidate for comparison 316 (2/8 baseline, zero low-health candidate failures).

Temporary-column recentering and descent now recognize grass_block only when
the tracked server-confirmed support was dirt at that exact position. The
block must remain solid and not waterlogged. The centered grounded stance,
real digging confirmation, dry surroundings, supported floor and bounded
refusal checks remain in effect. Other name changes are still rejected.

All 676 JavaScript tests pass. The regression runs recovery through confirmed
removal while preserving the interrupted tree task. Negative checks reject
other replacements, grass on a non-dirt tracked support, wet surroundings
and missing ownership records. No items or world terrain were supplied.

The fix is queued after comparison 317. It is not live until its rollout report
verifies fresh telemetry, protected weights, Minecraft/dashboard health and
a progressing fresh same-controller comparison.

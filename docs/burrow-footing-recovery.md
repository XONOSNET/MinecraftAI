# Recover shelter excavation footing

Small horizontal displacement during an emergency shaft dig previously ended the
entire attempt with `Emergency shaft footing changed`. A bot still standing on
the checked shaft cell now recenters using the existing controlled movement
helper before digging again. Centering does not count as material progress or
reset the excavation deadline.

A refuge invalidated before descent can also be rejected while the bot remains
on verified nearby surface footing. The location receives a temporary exclusion
and the survival planner searches for another refuge. This does not label a
breached underground shaft as safe, grant earth blocks, or award lesson credit.
Underground wall/floor breaches and the work-progress deadline retain their
existing failure checks.

Validation covers displaced footing, retrying a changed surface site, refusing
the same fallback underground, complete refuge construction and exit, and the
full JavaScript suite (484 tests).

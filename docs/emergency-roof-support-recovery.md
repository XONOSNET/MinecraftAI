# Recover a missing owned emergency roof support

Teacher trial 722 stopped at sealing with `Emergency roof support changed`,
after five confirmed shell repairs. Shell repair could resume excavation, but
the seal stage still threw immediately when the previously placed dirt lip was
missing. The report did not record the changed lip's block name, so this does
not prove the observed failure was an empty cell rather than an obstruction.
The error now includes that name for subsequent failures.

If the shell was verified, the support was previously placed by this refuge,
and its target cell is currently empty air, sealing returns to the existing lip
placement stage. It uses real carried earth and the same support, player,
footing, threat, inventory and confirmed-placement checks. Selecting recovery
does not reset the 30-second physical progress deadline. An occupied foreign
block, fluid, unloaded cell or unverified refuge cannot take this recovery.

Transition fixtures exercise support loss, rebuilding, sealing, daylight exit
and resuming the original gathering task. Negative checks preserve foreign
blocks and expire missing-material recovery without inventing progress. The
full JavaScript suite passes 694 tests. Survival effectiveness remains subject
to subsequent same-controller evaluations.

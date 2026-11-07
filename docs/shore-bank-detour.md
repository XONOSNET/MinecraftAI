# Shore return when a direct swim is too long

Opal repeatedly stopped returning home from the same supported shoreline in
baseline and teacher trials. At (24632.50, 63, 16462.69), strict dry footing
rejected the start because of adjacent water. The water-aware search reached
home, but selected 44 consecutive water cells, exceeding the existing 24-cell
crossing limit. The planner discarded that route without searching the bank.

For a grounded bot on a checked dry bank, a rejected complete water route now
triggers one bounded bank-only search. A complete checked detour, or a short
checked dry-ending prefix whose searched frontier makes real progress, can be
used. Normal swimming, air, current, player-space and exit checks remain in
place; this does not authorize a longer crossing.

Validation: all 673 JavaScript tests passed, including a regression where a
44-cell shortcut stays rejected and navigation selects a dry detour. A read-only
spectator inspection against Opal's actual terrain produced a valid 12-cell dry
prefix instead of a blocked plan. This verifies route selection, not a completed
survival run; live recovery remains to be measured.

This update and the workbench-return fix are queued after comparison 312,
without interrupting its candidate. The rollout restores protected models,
restarts only controllers and starts a fresh same-controller comparison. Treat
both changes as queued until the rollout report verifies the live revision,
eight fresh connections, Minecraft/dashboard health and learning progress.
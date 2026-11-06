# Resume construction after lighting consumes wood

Trials 657, 658 and 659 stopped the same bot at `build: No building
material available`, including a teacher attempt. Prebuild mining, tool and
torch preparation had finished, but construction did not recheck the remaining
wall and roof budget after those tasks spent planks.

Before resuming the enclosure, the shared controller now crafts carried logs
into planks and checks the actual missing blueprint cells. If supplies are
short, it harvests real wood through the existing gathering routine, returns
to the original plot and resumes construction. This trip uses the unfinished
blueprint requirement rather than the separate 28-plank settlement target.
Existing blocks and milestones remain intact. Survival interruptions retain
the pending supply trip; danger, water recovery, tool replacement and movement
ownership still take priority. Trial and stall limits remain in force.

Regression coverage follows the transition from an interrupted, partly built
house through insufficient and sufficient harvesting, a shelter interruption,
return travel, crafting mixed wood species and resumption of the original
blueprint. It also checks carried-log conversion and completed enclosures.
All 663 JavaScript checks passed. Full survival results after rollout are still
needed to measure the completion-rate improvement; this is controller recovery,
not a claim that the policy learned the behavior.

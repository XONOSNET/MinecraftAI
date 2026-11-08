# Open the visible half of a wooden door

Candidate trial 729 BirchBadger stopped during wool gathering at
[24570.4934,64,16416.5097]. Its route repeatedly arrived at the indoor door
approach. A read-only native inspection found the closed oak door at
[24570,64,16415]: the lower half failed the existing block sightline test while
the upper half at Y65 passed. The opening routine required the lower half to be
visible, so it never sent the door interaction and repeatedly reached the same
indoor approach instead of exiting.

The route opening check now selects an in-reach visible panel from the same
wooden door. It can interact with the matching upper half when that panel
occludes the lower half. Already-open doors, iron doors, unrelated upper blocks,
obstructed sightlines and out-of-reach panels remain excluded. It still pauses
movement, invalidates the old route and waits for sensed geometry on the next
step; selecting or clicking a panel never counts as crossing the doorway.

A route fixture exercises resumed wool gathering through the real walk opening
branch, checks the selected upper panel and unchanged phase, and ensures an
open door is not toggled closed. Negative cases cover blocked visibility,
unrelated panels and distance. A native read-only check against the recorded
world geometry selects [24570,65,16415]. All 699 JavaScript tests pass; survival
completion impact still needs evaluation after rollout.

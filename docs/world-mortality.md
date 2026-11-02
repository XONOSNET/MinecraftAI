# Survival attempts can end in death

World trials no longer stop living bots at low health or hunger. Existing food,
escape, cover, retreat and recovery decisions continue to run, including below
six health points. Emergency earth refuges no longer reject a living bot solely
because its health is six or lower. Excavation safety checks remain unchanged.

An actual Minecraft death immediately records a stopped attempt with failure
category `death` and zero health. Native respawn cannot continue that same
attempt: the controller retains a death marker for the run, including when an
awaited action finishes after death. A new assigned trial resets that marker.
Completed trials and reports from older runs are not invalidated by later deaths.
Trial deadlines, boundary checks, physical stalls, lesson criteria and model
comparison safeguards remain active. No health, food or equipment is granted.

Focused tests cover living critically injured/starving bots reaching the planner,
emergency cover below the old cutoff, zero-health failure, death during an
awaited action, and stale or post-completion death events.

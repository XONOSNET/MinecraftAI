# Shelter before exposed work

In hostile First Night trials, bots without both a carried melee weapon and at
least one worn armor piece prioritize shelter during surface darkness. An axe
alone is insufficient protection for nighttime work. During daylight, manageable
nearby encounters permit self-defense, including fists if no weapon is available,
even if a hut has already been built. Protected curriculum levels are unchanged.

Underground encounters use threat assessment rather than surface time alone.
Two sampled natural solid roof blocks between 3 and 16 blocks overhead indicate
underground terrain; leaves and wooden house roofs do not. This is a local
heuristic, not a complete cave map. Assessment counts visible hostiles within 12
blocks (18 for archers), weighs ranged and other dangerous monsters more heavily,
and compares pressure with health, a carried weapon and worn armor. Bare-handed
full-health bots can defend against one ordinary enemy, but retreat from two;
an armed full-health bot can face two ordinary enemies, but retreats from three
without additional armor. Low health below 12 also forces retreat. Assessments
do not award wins, supplies or combat capabilities.

When cover is needed, bots with completed huts interrupt work and return inside, close the door and
wait until daylight and visible nearby enemies have cleared. A shelter watch
does not release a bot for food gathering or because its health recovered or it
acquired equipment during the watch. Existing food consumption can still run.
The interrupted task resumes afterward; watches award no lesson credit.

Before a hut exists, bots proactively seek a verified earth refuge at full health,
using the existing real excavation, sealing and exit sequence. No enemy or damage
is required to start before nighttime work. Sand, gravel, water, unsupported
terrain and occupied plots remain forbidden. Blocked, unexcavated approaches
are temporarily rejected so another refuge can be tried. If no refuge is found,
bots retry rather than harvesting or fighting; with visible threats they can
move away along verified reversible ground routes. They cannot guarantee safety
where reachable suitable terrain does not exist. A failed search is not a
verified shelter and receives no stationary timeout exemption.

Sealed burrows retain daylight and surface-threat exit checks. House watches
retain the normal health, hunger, death and trial deadline guards. Nothing grants
equipment, resources, immunity or success. This is controller risk management,
not proof the policy model has learned independent shelter selection.

Validation: JavaScript regressions cover pre-damage nighttime cover, daytime
fist attacks, cave enemy groups, ranged pressure, health and equipment, worn
versus carried equipment, persistent house watches, resuming work,
blocked refuge reselection, and no fallthrough to exposed work. The existing
survival excavation test exercises digging, roof placement, daylight waiting and
physical exit. Deploy with a controller-only reload and fresh model comparison.

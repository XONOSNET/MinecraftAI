# Terrain-aware home exit and unfinished-floor return

The October 31 afternoon check found two reproducible goal-selection defects.

First Night resource trips still used the house's floor height for their outside
goal. At the raised LabAI0 house, the actual ground was one block lower. The
entrance canopy fix allowed the initial exit, but the later stone trip still
requested an unsupported point above that ground. Resource searches now use
the existing sensed `homeApproach` height. Quarry/lighting exit arrival checks
use that same measured goal, including its height.

LabAI7's unfinished-floor routine required a front approach point that was not
reachable, while native read-only inspection found a complete reversible route
onto the cleared plot itself. Before walls are built, there is no required
doorway. Floor return now prefers the front and then checks up to five intact
plot stances. Each alternative must be standable, clear of players, reachable
by the existing reversible planner, and outside other private plots. Dug holes
are excluded. The chosen point is retained while approaching it, and forgotten
on arrival or a new run. Unloaded fronts still use normal checked-prefix loading.

Validation: all 368 JavaScript tests pass. The raised-doorway native fixture
verified a First Night resource exit onto the actual lower ground in 13.2 seconds,
retaining 20 health in survival. A separate empty-sky survival fixture reproduced
an unreachable front marker and verified the alternative return walk in 2.6
seconds. Both fixtures were cleaned. Their diagnostic supplies/commands never
write production demonstrations, rewards or completions. Evidence:
`logs/entrance-native.json`, `logs/floor-return-native.json`, and the read-only
production terrain inspection in `logs/floor-route-inspection.json`.

Server health at the check was 20 TPS, 16 ms average tick time, eight bots online
and a 142.1-second terrain reset. Sleeping bots with a finished watch timer were
still awaiting their observed morning; this was not treated as a navigation or
infrastructure defect. A separate gathering-edge stall remains for investigation.

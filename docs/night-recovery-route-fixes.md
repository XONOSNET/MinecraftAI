# Failures before night recovery

A reviewed Night 3 teacher run had two actual deaths and four healthy controller
failures. Two other bots had completed stone tools/furnace/lighting and were
legitimately waiting inside their homes at night. Waiting there is not a stall.

* BirchToad built a flat hut whose doorway opened toward water. Loaded-world
  inspection confirmed there was no safe exit even with a larger route search.
  New plot selection now requires dry supported exit landings outside the door
  and keeps the entrance apron inside the simulation boundary.
* AmberRobin's fixed home approach marker was not standable. The route reached
  the adjacent exterior cell but could never reach that exact marker. Home
  approach selection now uses a nearby standable exterior landing when needed;
  the inspected replacement route reached home in 2,459 search expansions.
* DuskMoth's post-burrow return needed a wider detour than the original bounded
  search allowed. Plot returns now try one larger bounded search (up to 16,384
  nodes). Normal navigation can advance a checked prefix after budget exhaustion
  toward a known standable destination, then replan. Partial paths never award
  arrival or permission to start clearing. Solid blocked goals remain blocked.
* SolarSwift exhausted available support faces for a corner wall. Placement
  retries can now use the closer inner ring of the room, with at most eight
  distinct work positions. These retain player clearance, reach, route and
  placement-confirmation checks. Construction does not recenter a bot merely
  for reaching a valid outer work stance.

All 460 JavaScript checks passed, including unsupported/occupied work stances,
shoreline rejection, invalid home markers, wide detours and partial-route limits.
Read-only inspection of the existing production terrain verified the return
routes and rejected shoreline site. No production blocks, supplies, health or
success criteria were changed. Native probes were returned to staging and quit.
The ordinary death, boundary, lesson, stationary and time-budget rules remain.


The subsequent water-navigation update supersedes blanket shoreline rejection:
plots can use a checked source-water exit, and travel can wade/swim to a verified
bank. See [water-navigation.md](water-navigation.md) for current conditions and
limits. Dry building and mining requirements remain in place.

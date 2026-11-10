# Repair blast damage before enclosure is complete

AmberRobin's trial 790 stopped in smelting after `windowOpen` timed out.
Read-only native inspection found a crater through the unfinished floor, an
absent workbench at its designated location, and a crafting table at the expected
furnace location. The controller had earned the furnace milestone but not the
hut milestone, so its existing home repair inspection did not run.

Repair now covers this intermediate state once the furnace milestone has been
earned. Its partial blueprint contains only the already-required floor,
workbench and earned furnishings. It does not complete future walls or award
hut credit. Existing checked bottom-up foundation backfill, real material
budgets, gathering, recipes, placement and verification are reused. The saved
interrupted phase resumes once those parts verify.

An owned misplaced workbench at a furnace cell can be mined after a checked
approach, using the normal reach, visibility, fluid, player and support guards.
Other block types are not broadly removed. Furnace interaction also rechecks
that the station is still a furnace, including after a failed asynchronous
open. A detected change yields briefly to repair with the existing bounded
response retry budget instead of ending the attempt immediately.

Regression tests cover pre-hut crater/station restoration, real material and
recipe consumption, untouched future walls, no new milestones, resumed smelting,
and furnace destruction before/during opening. Full JS suite: 715 passing.

`scripts/verify_partial_blast_native.cjs` builds a disposable damaged floor and
misplaced station in an isolated sky fixture. Native repair filled the crater,
restored both stations and resumed charcoal production with real inventory,
full health and no hut milestone. All fixture blocks, inventory and drops were
cleaned. This establishes that transition; it does not prove recovery from every
blast size, adjacent-fluid crater or subsequent hostile attack.

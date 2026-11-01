# Replacing beach foundations with wooden floors

The first Night 3 site included flat sandy plots that passed the terrain survey.
Four bots in the first baseline stopped with `Floor foundation is obstructed`:
the floor builder accepted dirt and stone but rejected sand. Read-only native
inspection confirmed sand in three of those plots; the fourth plot was unloaded
in that inspection and was not treated as verified evidence.

The floor builder now accepts sand, red sand, gravel and common natural surface
soils. Every solid foundation tile must be an exposed top layer over a loaded
solid support, with no adjacent water, lava or fire. An overhead block prevents
excavation, so the builder does not undermine a falling column. Existing body,
other-player, reach, settling, placement confirmation and bounded retry checks
remain active. Refusals now identify the actual material and coordinates.

Validation: all 389 JavaScript tests passed. Tests cover supported sand/gravel
replacement and rejection of fluids, unloaded neighbors, unsupported tiles,
overhead sand and furniture. `node scripts/verify_sand_floor_native.cjs` verified
actual survival-mode digging and oak-plank replacement for sand, red sand and
gravel in an isolated, initially empty sky fixture, with full health. The fixture
and its drops were removed afterward. Its supplies belong only to the diagnostic
player; production bots received no items or fabricated lesson progress.

Deployment restored the unvalidated candidate bundle, reloaded only the bot
controller and began comparison 185 at Night 3, site 1. All eight bots reconnected
and Minecraft retained PID 57276. The dashboard and Minecraft were not restarted;
the separately committed shelter-watch HUD change still awaits a normal service
restart. Early hostile deaths and other plot/navigation failures are separate
issues to observe during the four-hour monitoring window.

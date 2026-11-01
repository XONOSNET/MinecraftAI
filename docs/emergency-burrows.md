# Temporary earth refuges for ranged attacks

Night 3 bots can seek emergency cover before a house or equipment is available.
An injured bot facing a nearby archer, or a nearby hostile while at health 16 or
below, searches loaded terrain for a short, checked route to a dry earth patch.
Bots near their existing house keep the normal shelter-return behavior.

The candidate needs two hand-diggable earth blocks, an untouched solid floor,
and a loaded, solid surrounding shell. Sand, gravel, concrete powder, fluids,
waterlogged cells, caves, unsupported ground, private plots and occupied ground
are rejected. Candidate sites must provide separation from the attacker; if a
mob catches up before digging starts, the bot seeks another position. A safe
patch is not guaranteed to exist within the bounded search radius.

From centered footing the bot digs one block, uses recovered dirt to put a
small cover/support block toward the attacker, then digs the second block and
seals the opening against that support. It starts with no injected supplies.
All digging and placement use real survival packets and server confirmation.
The bot refuses to call a shaft safe if a hostile has entered it or its roof,
walls or floor have failed.

Only a confirmed sealed refuge permits a stationary wait. Global health,
hunger, death and trial-time limits remain active. The wait ends during daylight
when a surface viewpoint finds no nearby threats; ranged threats receive a
larger clearance radius. Dead entity metadata cannot keep a refuge occupied
forever. The bot digs the roof and support back out, then performs two actual
jump placements with the recovered dirt to reach the original surface. It
resumes its previous lesson, without awarding any hut, scouting, bed or survival
milestone for hiding.

The diagnostic fixture began with an empty inventory and an actual skeleton.
The final run sealed the refuge in 3.05 seconds, retained 20 health during the
sealed wait, and reopened/reclaimed/climbed out in 3.75 seconds. Daylight was
injected only into the diagnostic controller's local sensor to test its exit;
server time, production lessons and production rewards were not changed.
Earlier close-start fixtures exposed the risk of mobs following into an open
shaft and redundant inventory round trips delaying the roof. Those failures
led to separation checks, the protective lip and a faster confirmed-inventory
path; they are not claimed as successful survival tests.

All 411 JavaScript tests passed. Coverage includes sand/gravel/fluid/cave and
player/plot rejection, separation/replanning, complete material accounting,
sealed waiting, daylight/threat gating, dead archers, physical-progress failure
and no lesson credit. Run `node scripts/verify_emergency_burrow_native.cjs` for
the isolated survival fixture; its terrain, mobs, drops, experience and temporary
operator status are cleaned, with terrain cleanup verified.

This is a controller survival skill, not proof that the policy has mastered
Night 3. It will not dig into unsafe terrain to force an escape, revive a dead
bot, or weaken the survival lesson. Deployment reloads only the bot controller,
restores unvalidated model weights and starts a fresh comparison at the same
site/support level, retaining demonstrations.

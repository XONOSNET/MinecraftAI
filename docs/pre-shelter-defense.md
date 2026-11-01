# Responding to nearby hostiles before shelter is built

Night 3 candidate 186 had seven stopped bots: six damage/death failures and one
gathering stall. The remaining bot was sheltered at health 6.3, food 14, without
food to regenerate. The survival planner previously only reacted to threats by
retreating after a hut existed; earlier gathering and construction had no combat
handoff.

`survival_defense` now interrupts work before the hut milestone when an ordinary
hostile such as a zombie or skeleton is visible within 4.5 blocks and inside the
trial bounds. It keeps a nearby target, selects a carried sword/axe if available,
and otherwise uses the held item or fists. It submits normal combat observations
and teacher actions to the existing combat specialist. Candidate actions remain
the candidate's decisions; they are not replaced with teacher attacks. Real
equipment, reach, sightline and cooldown checks govern every hit. Backward
spacing requires a positive rear-ground probe. Critical jumps are disabled for
this emergency reaction.

This response does not attack animals or neutral endermen, chase distant mobs,
or replace the existing retreat behavior once shelter is built. Creeper escape
and other specialized threat responses remain separate work. Protected support
levels and sleeping bots do not activate it. No weapons, health or supplies are
granted to production bots.

Critically injured sheltered bots below food 18 with no cooked or safe raw food
now end with an explicit `food_exhausted` reason instead of waiting indefinitely
for regeneration that cannot happen. Real recovery remains allowed when food
is adequate. Death still ends a trial attempt; server respawning returns the
bot to the waiting area, without rejoining that same trial.

Validation: all 402 JavaScript tests passed. Tests cover combat policy/teacher
separation, cooldowns, fists, carried equipment, safe rear spacing, target
scope and the First Night interrupt. Recovery checks distinguish impossible
regeneration from genuine recovery. The isolated native fixture
`node scripts/verify_survival_defense_native.cjs` defeated an actual zombie
with three hits in 8.1 seconds in survival mode, with health 20 and the gathering
phase preserved. Diagnostic supplies were confined to the fixture account.
Fixture terrain cleanup was verified while its chunks remained loaded; the
zombie, drops, experience and operator privilege were removed. The initial
fixture exposed an unsuitable fixed combat height cap, which was replaced by
the actual dimension height range before the passing run.

Only the bot controller was reloaded. Eight agents reconnected; Minecraft and
the dashboard stayed up. Unvalidated candidate weights were restored before
starting a fresh comparison at the existing Night 3 site, retaining examples.
This is a validated controller capability, not evidence that the current neural
policy has mastered hostile combat or that Night 3 is solved.

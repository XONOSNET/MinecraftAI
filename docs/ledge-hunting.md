# Hunting animals from a reached ledge approach

A candidate bot stopped while pursuing wool after reaching its selected stance.
Its target remained eligible, but First Night required the animal's feet to be
within 0.6 blocks of the bot's feet before handing control to hunting. An animal
on a nearby one-block ledge could therefore cause repeated walks to an already
reached destination instead of an attack.

Target selection and First Night now share one engagement check. Level-ground
animals keep the existing 4.5-block chase range. An animal at a different height
can engage only when visible and within the existing 2.7-block melee decision
range. The combat controller still checks real reach, sight, the equipped
weapon, target ownership and attack cooldown before swinging.

Validation: 385 JavaScript tests pass, including an integration case proving
that First Night attacks rather than rewalking the same stance. The isolated
native survival fixture `scripts/verify_ledge_hunt_native.cjs` confirms a real
sheep kill one block above the bot, with full health and no production learning
writes. The fixture removes its animal, drops and blocks afterward.

At deployment, the protected baseline and teacher had each completed 8/8.
The pending candidate already had one stopped bot and could finish at most 7/8.
Deployment restores its unvalidated model bundle and starts a fresh comparison
with this controller on both sides, retaining all demonstrations.

# Combat and hunting behavior

Hostile combat and passive-animal hunting retain the existing seven action IDs and twelve combat observation features. No checkpoint dimensions or weights are changed by this controller update.

Hostile attack intentions can perform one bounded jump on supported terrain with adequate headroom, wait for a definite descent, and swing with sprint disabled. Preparation can overlap the last 400 ms of weapon cooldown. Low health, low ceilings, edges, water, climbing blocks and blindness suppress jump assistance. Explicit movement pauses cancel a pending jump. Targets, reach, visibility, weapon ownership and cooldown are rechecked before the real attack packet; damage is never granted by commands.

Passive animals use a hunting style. Hunting disables combat circling/back-spacing and lateral alignment assistance on the chase route. The selected animal remains eligible despite a stale rejected resource landmark. Chase approaches refresh every 250 ms or when the animal moves substantially; larger height differences use route planning. Within local melee range, forward pursuit continues during cooldown and attack intentions when the target is pulling away. Existing flat-ground travel sprinting remains available on safe longer approaches.

Prepared lesson livestock initially wait at their assigned station. A successful hit requests normal AI for that specific UUID, guarded by bot ownership, species, reservation bounds, active run and support level. Natural-resource lessons never receive this command. The server's normal passive-animal panic behavior supplies fleeing movement. Pickup permits loot near the recently struck animal even if pursuit has crossed its original station boundary.

Successive swings use weapon readiness without an added combo pause: swords use 625 ms and wooden/stone axes use 1250 ms, unless the lesson explicitly requests a longer delay. Hunting does not add jump wind-up.

Validation: 213 JavaScript tests and 241 Python tests passed. A native server fixture measured a grounded iron-sword strike against a husk at 5.904 damage and a falling strike at 8.856 damage (50% higher). Initial local-only falling detection proved insufficient; the actuator now waits for an established descent before swinging. The fixture also pursues a cow across the lit test platform with multiple full-cooldown swings and no lateral controls. Exact latest timings and fixture grants are recorded in combat-and-hunting-native.json. This is a mechanics check, not full eight-bot wilderness qualification.

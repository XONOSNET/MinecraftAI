# Hunting equipment and recorded First Night stops

Investigated the baseline run `world-1793322313331728700`.

- SolarSwift (LabAI4) repeatedly requested attack action 6 against a sheep with an empty hand. Native inventory inspection found its stone axe in main inventory slot 9 and a wooden axe in slot 21. The attack actuator correctly refused barehanded hits, but policy attack requests never equipped the carried axe.
- OakToad (LabAI3) stopped after 322.885 seconds because the server refused a hut-wall plank placement at (24630, 66, 16472). The report proves the rejection; it does not identify the precise obstruction or stance at that instant.
- BirchToad (LabAI6) stopped after 1079.804 seconds at `torch_craft: Missing materials for stick`, after reaching charcoal.

Changes:

- First Night hunting opts into equipping an existing carried weapon when the policy requests an attack with the wrong item selected. Minecraft 1.21.4 uses the existing authoritative inventory synchronizer. Preparation does not count as a hit, kill, or material progress. Standalone combat lessons still require their explicit equip action.
- Rejected wall placements can retry from up to two other reachable, supported, unoccupied interior positions. The server must still verify placement; repeated rejection still stops explicitly.
- Torch handles first use carried logs to craft planks and sticks. With no carried wood, wilderness bots take the existing real wood collection trip before returning to crafting. No resources are granted.

Validation: all 309 JavaScript tests passed. `scripts/verify_hunt_gear_native.cjs` passed against the local Minecraft server: empty selected hand + stone axe in slot 9 -> confirmed equipped axe with zero preparation hits -> actual sheep death after two hits in 1.397 seconds. The diagnostic fixture and its drops were cleaned up; it did not write production learning data. Native result: `docs/hunt-gear-native.json`. Wall recovery and torch resource handling have regression tests; their recovery paths have not yet been confirmed in a new production trial.

Deployment: automatic approval review rejected the controller stop/restart command with `blocked by policy` and no further reason. The controller was not restarted. World learning remains paused after the authorized stop endpoint completed (`restore_pending=false`). Changes are saved but not active in the existing process. After a user-initiated lab restart, start a fresh world learning comparison with the previous options: scenario 2, size 128, mission first_night, prepared true, auto_progress true, night_level 1. Do not compare the old baseline against a candidate using the changed controller.

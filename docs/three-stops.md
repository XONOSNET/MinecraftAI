# Three stopped bots: controller corrections

The saved live stop reports (`logs/three-stops-before.json`) identified:

- BirchToad: return-home stalled for 60 seconds. Door alignment started from a diagonal position before the checked route reached the door aisle. The helper could shortcut across a wall. Acquisition now waits until within 0.65 m of the aisle. Doorway safety checks follow its own movement target instead of the original route cue.
- DuskMoth: stationary for 90 seconds while gathering. The generic wall ray rejected a clear route endpoint 0.43 m away. A flat endpoint within 0.8 m now suppresses that ray only when its actual body corridor passes `canWalk`; blocked corridors still stop movement.
- OakPanda: the server refused its crafting-table placement repeatedly. The original refusal was not reproducible on an isolated platform with matching stance offsets. Crafting and placement succeeded twice. Retries now change approach side instead of repeating the same stance, and footing is checked again after crafting the table.

Validation: 271 JavaScript tests passed, including blocked-endpoint protection, diagonal doorway acquisition, and changed-side placement retry. Native replays originally failed both navigation cases for the full 6.5-second diagnostic window; after correction BirchToad reached home in 2.635 seconds and DuskMoth reached its gathering stance in 0.292 seconds. These use teacher intentions through the shared motor to isolate controller behavior, and do not prove student success on the complete lesson.

Native results: `three-stops-before.json`, `three-stops-native.json`, `workbench-native.json`. The workbench fixture uses only a diagnostic bot; temporary blocks, items and operator permission are cleaned up. No production resources or successes were granted.

Learning was paused with no pending candidate restoration. Only the bot controller was restarted. All eight bots reconnected, and automatic learning resumed at the saved level-1 First Night site (scenario 2, size 128), beginning a fresh comparison with the same controller on both sides. Model files, training data, bot identities, configuration and unrelated edits were preserved.

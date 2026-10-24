# Minecraft Autonomous AI Evolution Laboratory

Local research prototype for eight configurable neural agents in one persistent Paper survival world. Nine curriculum tracks cover navigation and bounded survival foundations in elevated practice arenas. Normal world survival remains enabled. This is an initial learning experiment, not a complete autonomous survival player.

## Run

From PowerShell in this directory:

```powershell
./scripts/Start-Lab.ps1
```

Dashboard: http://127.0.0.1:8000. It now guides you through **Collect examples → Train the network → Test learned behavior → Review**. Each stage explains what the bots are doing and highlights the next action. Training deliberately pauses movement; its live progress, completion notice and saved checkpoint appear on the page. No token pasting is needed in the browser: the localhost page establishes a same-site, HttpOnly session. Command-line clients still use `data/api-token`; never publish that token.

Minecraft Java **26.3** clients can join via ViaVersion while Paper and bots remain on 1.21.4. Multiplayer → Direct Connection → `127.0.0.1:25565` on this computer, or `192.168.1.24:25565` from the trusted LAN. Human and bot connectivity have both been verified.

For a fresh checkout, first run `./scripts/Setup.ps1 -AcceptEula` only after reading and agreeing to the Minecraft EULA. Python 3.11 and Node.js 22+ must be available. Setup downloads project-local Java and Paper and installs locked packages. First startup creates the two research courses once and preserves `data/arena.initialized` with the world. Keep that marker when restoring the world so startup does not rebuild the courses.

```powershell
./scripts/Stop-Lab.ps1
```

Shutdown pauses learning, atomically checkpoints the policy/optimizer, stops Minecraft through its console, and stops owned controller/service processes. Start the lab and bots again to recover the checkpoint and existing world. The service starts paused.

## Experiment

Pause autonomous training before running the original navigation experiment driver. `./.venv/Scripts/python scripts/experiment.py` runs untrained/current-checkpoint and random evaluations, collects live teacher demonstrations, trains with behavioral cloning, and evaluates the neural student independently. A current checkpoint must not be called untrained if it has already learned. Use fresh data/checkpoint directories for independent replications; preserve existing results first. Evaluation uses 3 episodes per agent, 120 decisions maximum, 5 physics ticks per action, and deterministic per-agent task seeds. Do not run two experiment drivers simultaneously.

The original navigation teacher turns toward a supplied point goal and walks forward. It does not use pathfinding. Teacher movement is explicitly labeled. Student evaluation selects every action from a PyTorch neural network, without teacher fallback. Flat-course success does not establish obstacle avoidance or natural-terrain generalization.

The dashboard starts training as a background job so status and agent heartbeats keep updating. You can cancel before checkpoint saving begins; cancelled or failed training keeps the previous active model. Only one training job can run at a time. Older scripts that call `/control/train` without `{"background":true}` still wait for the final result. A test automatically stops each bot after its three tasks; the page explains this waiting state and shows the completed result.

## Data

- `data/lab.sqlite`: agents, visible block memories, episodes, events, model metadata (WAL mode).
- `data/transitions.f32`: sequential float32 rows, 70 observations + action + reward, 288 bytes/row; diagnostic log, not a complete off-policy replay dataset.
- `data/demonstrations.npz`: observations and teacher labels saved when training starts.
- `checkpoints/latest.pt`: atomic recovery checkpoint, plus up to 10 versioned checkpoints.
- `backups/`: last 3 periodic world ZIPs; `server/world*`: live persistent dimensions.
- `logs/`: service, bot, and Minecraft diagnostics.

## Tests and troubleshooting

```powershell
node --test tests/perception.test.js
./.venv/Scripts/python -m pytest -q
```

Inspect `logs/service-error.log`, `logs/bots-error.log`, and `logs/minecraft-console.log`. Initial Paper startup downloads Mojang files and can take longer than subsequent starts. Wait for `Done` before spawning bots. Port conflicts fail instead of starting a second server. A failed arena command (`That position is not loaded`) invalidates an experiment; the current arena setup force-loads both courses before building them.

Minecraft and the authenticated dashboard bind to loopback. A bounded bridge exposes Minecraft only at 192.168.1.24:25565 to 192.168.1.0/24. The scoped Windows firewall rule permits that LAN connection; no router forwarding is configured. Local offline identities are suitable for this trusted LAN and do not authenticate account ownership. RCON remains disabled. EULA accepted explicitly in chat on 2026-10-21.

Java 26.3 clients can join through pinned ViaVersion 5.12.1 while the server and bots stay on 1.21.4. The dashboard shows online players, saved operator levels, server readiness, RAM and tick metrics. Start/Stop/Restart run in the background, preserve the world/model/examples, and leave the dashboard available. Learning stays paused after server operations. Player administration supports OP/deop, game modes, teleport, heal, feed and disconnect through validated commands. Xonosnet was granted operator level 4.

See ARCHITECTURE.md, RESEARCH.md, EXPERIMENTS.md, PROGRESS.md, and SYSTEM_CHANGES.md for scope and evidence.


## Autonomous skill curricula

Use **Start / resume autonomous training**. The scheduler resumes the saved stage and unlocks broader tasks after navigation passes. You can close the browser while the lab and computer remain running; sleep or shutdown stops progress. Server Stop/Restart pauses automation, which can be resumed explicitly. The dashboard shows phase, samples, tests, stage history and each skill track.

| Track | Practice stages | Measured success |
|---|---|---|
| Navigation | Short routes, longer routes, full turns, long routes with full turns | Reach the goal alive |
| Traversal | One, three or four hurdles; doorways; raised causeway | Jump over one-block barriers and reach the goal |
| Hazards | Water, magma, long trench, twin islands | Reach the goal without contacting the hazard or substantial damage |
| Exploration | 10, 18, 22 or 32 new cells; pillar and perimeter courses | Visit distinct two-block cells without a goal-direction oracle |
| Gathering | One, three, four or five logs | Break visible practice oak logs and actually pick up the drops |
| Nutrition | Hunger recovery, eat to full, eat then navigate | Consume supplied bread after hunger is observed; recover to at least 18 food |
| Shelter | Near/far roofs, compact canopy, doorway approach | Reach a goal-marked roof and verify overhead cover |
| Integration | Hurdles with water or magma | Reach the goal without hazard contact or substantial damage |

There are 120 stages across eleven tracks. Stages 41-60 progressively add wide, long, narrow, offset and turning bridges; real closed wooden doors; shallow water pits, magma detours, hurdles, and combined gauntlets. Door interaction is restricted to named task doors inside practice lanes; success requires observing the doors open. Navigation requires two accepted tests at 90% or better; other tracks require two at 80% or better. Each cycle evaluates the protected model on fresh held-out trials. If it passes, those results count toward promotion and the next cycle confirms on a different seed without retraining. If it fails, the streak resets; the lab collects fresh teacher examples, trains, and compares the candidate on the same held-out tasks as its baseline. Equal or higher scores keep the candidate; lower scores restore that track's protected weights and optimizer. Navigation uses its original 70-input/four-action model. Each broader track has an independent 82-input/seven-action model initialized from navigation, independent replay (15,000-example cap), and independent checkpoints. New skills do not overwrite navigation weights.

Collection targets are 1,500 examples per cycle, or 150 for nutrition because eating has long preparation/consumption intervals. Continuous mode renews sessions after 112 cycles or six hours. After all 120 stages pass, it starts a fresh-seed review round from the beginning, retraining skills only when their saved policy fails review. Plateaus trigger a refresher and reduced training rate in continuous mode. Runtime/resource failures and explicit manual pauses still stop learning. State persists in `data/curriculum.json`; skill data lives in `data/skills` and `checkpoints/skills`. Interrupted unaccepted candidates are restored before recovery continues. Existing navigation state is migrated without clearing its history or examples.

Under **Practice and test a skill**, pause automation, select a stage, and choose a teacher reference or neural policy test. Teacher references collect demonstrations without updating weights. After at least 100 examples, **Train this skill** trains the selected head; **Test this skill** runs it on fresh tasks without teacher control. Teacher results and neural results have different labels. Practice runs do not bypass autonomous promotion gates.

Navigation arenas remain at X=160/240, Y=181. Broader training/testing arenas are at X=320/480 with separate bot lanes at Z=0,12,24,36,48,60,72,84 (eight bots). Only these practice areas are rebuilt. Two-layer floors contain water fixtures. Lighting and scoped hostile-mob cleanup protect the exercises from unrelated creeper explosions; the surrounding survival world keeps its normal rules. Task resets clear only bot inventories, replenish practice materials, and restore bot health. Nutrition intentionally reduces food through a temporary hunger effect. `config/curriculum-permissions.json` permits only visible practice oak-log harvesting and supplied bread consumption within the assigned lane; general digging, placement, combat and inventory automation remain disabled.

The additional 12 features are local forward foot/head obstruction, local hazard/edge and side-clearance probes, log/food inventory counts, overhead cover, nearby visited-cell memory, and coverage progress. Resource harvesting additionally requires a ray-observed visible log and Minecraft reach checks. Exploration suppresses point-goal inputs. Gathering and shelter use goal-marked exercises. All policy actions in neural tests come from the network; scripted teachers only provide demonstrations/reference measurements.

These are bounded survival foundations using behavioral cloning and candidate selection, not general survival, crafting, combat, reinforcement learning, or architecture evolution. Keep the computer awake yourself for unattended training; Windows power settings are unchanged.


For explicit validation after pausing automation, run `./.venv/Scripts/python scripts/verify_curricula.py --stages 4 5 --driver teacher` (reference demonstrations), or `--stages 4 --driver student --train` to train/test that independent head. The tool preserves navigation weights and writes a labeled JSON report. It intentionally refuses to interrupt an active autonomous run.


## Watch the bots and scale the cohort

In **Watch in Minecraft**, use player **Xonosnet**, choose LabAI0–LabAI7 and a view, then click **Follow / change view**. First person attaches to the bot; behind, side, overhead and orbit use invisible camera anchors. Following views move with arena transfers and reattach after respawn. Distance and height are adjustable. **Stationary camera (stay here)** anchors at your current location and turns toward the selected bot; selecting another bot and applying keeps that position. Distant bots may be outside Minecraft's render distance; choose a following view to travel to their arena. **Stop following** restores the game mode, position and orientation saved when you entered follow mode. Offline players wait; stopping while disconnected restores the saved state on rejoining. No operator grant is needed for watching. Only click Follow for a player you intend to control.

The measured machine is a Ryzen 9 5900X (12 cores, 24 threads) with 31.9 GiB usable RAM. Eight agents are the deployed starting cohort: three more than before. Observed eight-bot references held 20 TPS at approximately 2–3 ms/tick, around 5% overall CPU and 46% system memory. These are local measurements, not a maximum-capacity guarantee. Consider ten only after watching tick times and memory during a longer training run; reserve slots for humans (the server currently allows 12 players).

`config/agents.json` sets count (1–10) and episodes per agent (default 3); restart the full lab after changing it. Both controller and service read it. Lane construction, connection gates, completion counts, progress displays and verification scripts scale with this setting. Eight bots run **24 tasks per baseline/candidate test**. Old results retain their original 15-task cohort size. Changing count resets the current promotion streak while keeping completed stages, checkpoints, examples and history. Resource pauses remain active; population does not change automatically during a comparison.

Stages 17–32 append offset/alternating doorways, four hurdles, a raised causeway, a longer water trench, twin magma islands, pillar/perimeter exploration, four/five-log compact groves, eating to full, eating then navigating, a compact canopy, shelter through a doorway, and combined hurdle/water or hurdle/magma courses. They reuse scoped practice permissions. The combined courses have their own independent integration policy. New courses remain queued until earlier stages pass; adding a course does not imply its neural policy has mastered it.


`node scripts/verify_observers.cjs` joins a temporary non-OP test viewer, checks all six views, switches stationary targets and verifies mode/position restoration. Add `--transfer` while autonomy is running to wait for a natural arena transfer and verify that the first-person camera travels with the target. The script leaves human players untouched and disconnects its test viewer when finished. Gathering action 5 can sweep its camera up/down within the assigned lane to rediscover logs outside the current view; actual digging still requires a visible ray hit and reach checks.


## Terrain navigation and protected courses

Eight appended terrain stages cover a three-block stepped ridge with safe descent, rolling hills, a narrow raised water crossing, an offset crossing, seeded boulder slaloms, a two-block-clearance passage, ridges with magma avoidance, and varied ridge profiles with slippery patches. Layout offsets, boulder widths, crossing sides, starting headings and mixed profiles vary by seed; demonstrations and evaluations use separate arenas and seed namespaces. Terrain has its own 82-input/seven-action policy and replay. No finite curriculum guarantees natural-terrain generalization: the test measures each named course, and promotion still requires two passing held-out evaluations.

Practice arenas now have high canopies at Y=224, outside both the shelter sensor and every configured camera position. These prevent phantom spawning over training players. Local phantom cleanup runs every two seconds and other scoped hostile cleanup every ten seconds, including when learning is paused. World difficulty, day/night cycle and monster spawning elsewhere remain unchanged. The dashboard shows protection status. Bots previously killed while paused are returned to practice when training starts; this update does not introduce combat training.

Console broadcasts to operators are disabled through broadcast-console-to-ops=false. Commands you type keep their normal feedback; camera movement and housekeeping stay in server logs rather than operator chat. The previous live server.properties was backed up locally before changing this setting.

Mobile observer sessions detect long teleports, respawns and run changes. They clear the old camera, move the viewer into the new arena, wait briefly for chunks, and attach the requested view. A live same-entity transfer regression checks all five moving views plus fixed stationary behavior, loaded viewpoint chunks, and return-mode/position restoration. Run node scripts/verify_observer_transfers.cjs with autonomous learning and manual activity paused to repeat that operational check. Temporary NPC positions are restored afterward.


Enable **Cycle bots** independently of the observer View selector (Orbit, Side, Behind, and other views remain available) to automatically follow online bots in sequence. The interval defaults to 30 seconds and accepts 5-3600 seconds; unavailable/dead bots are skipped. Stop following restores the viewer as usual. No client mods are required.


With Cycle bots enabled, Jump (Space by default) selects the next online bot in-game; key edges are detected using vanilla input predicates, with no client mod. The dashboard also provides Next AI and a Space shortcut outside form controls. Continuous-mode learning plateaus revisit the preceding stage within the same skill track, keep the protected model, and halve the failed stage learning rate down to 1/8. Explicit pauses and resource/runtime safeguards remain.

Agent serials A0001-A0008 persist across respawns and restarts. They identify persistent workers, not selected individuals: policies are shared within each skill track and no bots are permanently eliminated. Death/spawn records begin when identity tracking is installed; successful-trial totals include all recorded controllers.


Advanced and terrain course route checkpoints now provide the same bearing cue to teacher and neural controllers. This is checkpoint-guided traversal, not independent route planning: the policy still selects turns, forward movement, jumping and door interaction. Bridge centerlines and exit goals match deck widths. Incompatible advanced/terrain observation-v1 demonstrations are archived locally before fresh examples are recorded; saved policy weights and other skill replays are retained. Promotion still requires two fresh 24-trial batches above the existing 80% threshold, without water contacts.

In-game activity rows show bot name, action and reset countdown. Serial IDs and death counters remain stored but are omitted from the observer HUD and dashboard labels.


The catalogue is ordered by prerequisites and task complexity rather than the date courses were added. See [the complete 120-course order](docs/CURRICULUM_ORDER.md), including original numbers for historical results. Eight tiers progress from navigation foundations through basic survival, doors, water safety, terrain, difficult crossings, combined courses, and final gauntlets. New surfaces such as soul sand and cobwebs are introduced before their combined challenges.

Catalogue v7 preserves policy weights and remaps saved result history by course identity. The reordered validation pass begins at stage 1 and is deliberately paused until resumed. Independent skill policies remain separate; difficulty tiers describe the intended progression across tasks, not a single mathematically measured difficulty score.

Choose **Action camera (stream director)** in Follow AI for eight smoothly blended shots: chase, right tracking, front reveal, crane sweep, wide orbit, left tracking, low front and high establishing. Framing changes every 12 seconds and loops continuously. Distance/height adjust the framing; Cycle bots independently changes the subject at its chosen interval. The camera continues moving while bots wait, follows torso/travel direction, and retains arena-transfer and respawn handling. No client mod is required.


The expedition track adds 50 courses across swimming, rock steps, ladders, caves, straight catwalks, waterfall ascent, flooded caves, ascending caves, turning catwalks and summit combinations. Each family has five levels. The new introductions are integrated into tiers 4–8 rather than appended after the final gauntlets.

Expedition courses use their own 82-input/seven-action policy and replay. Their observation includes local water/ladder state, breath, vertical checkpoint offset and route progress. Actions 5/6 mean ascend/descend only in this track; other tracks retain harvesting/door/eating semantics. Swimming/climbing use normal Minecraft physics and jump controls; no flight, in-trial teleporting or water-breathing effect is used. Checkpoints are shared with the teacher; these are guided 3D traversal tasks, not autonomous cave route discovery.

Success requires the correct 3D finish, ordered checkpoints, health, and actual water experience on aquatic tasks. Water remains a failure in older water-avoidance courses. Elevated course construction/reset is confined to owned practice lanes, including cleanup up to Y=211. Full autonomous promotion still needs two 24-trial passing batches at 80%. Reference verification can use one trial per bot to screen each layout efficiently; its result is feasibility evidence, not learned-policy mastery.

## Automatic startup and recovery

Run `./scripts/Enable-LabAutostart.ps1` once. A per-user Windows Startup shortcut and the **Minecraft AI Lab Watchdog** scheduled task start the supervisor after sign-in. The task checks every five minutes that the supervisor is running; its file lock prevents duplicate supervisors. The supervisor checks the dashboard, Minecraft, bot controller and LAN HTTPS helper every 15 seconds, backing off to five minutes after repeated errors. It does not bypass execution policy or require administrator privileges. The PowerShell executable used during installation is saved in both startup entries.

`Stop-Lab.ps1` marks a deliberate shutdown so recovery leaves it stopped. `Start-Lab.ps1` clears that marker. A dashboard Stop server operation is also respected. Training safety pauses remain separate: service recovery does not automatically resume learning. `Disable-LabAutostart.ps1` removes both startup entries and stops only the supervisor, leaving running services alone. Supervisor diagnostics are in `logs/watchdog.log`.

Startup requires Windows sign-in, and recovery requires the PC to remain awake. A live but unresponsive service is preserved to avoid interrupting saves. If the dashboard dies while Minecraft survives, the supervisor requests an in-game `/stop` in its log rather than force-killing the world; it starts the lab after that safe shutdown.

## Bot names and active camera cycling

Bots receive unique generated display names stored in `agent_identity` in the lab database. Names survive death, respawn, new trials, curriculum rounds and restarts. Internal LabAI account identifiers remain stable for training history and commands; vanilla name tags show the generated name as a team prefix. Dashboard lists, camera selectors, bot cards, in-game activity rows and personal camera bars use generated names.

In Follow AI, **Follow active bots only** is checked by default and applies when **Cycle bots** is enabled. Finished bots leave the cycle pool after their full trial batch, rather than after each individual trial. The camera switches immediately if its bot finishes and another eligible bot is available. When none remain it holds its current target, including when Next AI / Space is pressed. Bots become eligible again on new trials; teacher collection remains eligible. Uncheck the option and click Follow / change view to cycle all online bots.

## Realistic terrain courses

The 140-stage catalogue now includes 20 natural-terrain exercises, integrated by difficulty. These bounded practice dioramas introduce rolling meadows, woodland roots, rocky gullies, steep slopes, open cottage interiors, hamlets, creek-bank stone crossings, basalt lava crossings, ravine jumps, abandoned mountain cabins and volcanic ascents. Houses have actual walls, windows, interior checkpoints and entrance/exit portals. Their passages are open; closed-door skills remain in the existing door curriculum. Trees stay beside the route; lava is contained by nonflammable basins and walkways.

The expedition policy uses its existing seven actions and vertical observations. Raised stepping stones require jumps at ravine and lava crossings. Gap courses expose the same forward-and-jump controls to the teacher and learned policy; neural tests still choose their own actions. Required-jump exercises cannot pass without a recorded jump, and lava contact fails a trial even before health damage arrives. The original policies, identities and histories are retained; catalogue v10 migrates v9 course indices by stable identity and preserves the saved stage/review round.

The in-game activity sidebar uses independent scoreboard rows so team prefixes cannot duplicate generated names. Each row shows only the bot name and action; reset countdowns remain in the detailed observer HUD.

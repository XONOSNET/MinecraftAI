# Minecraft Autonomous AI Evolution Laboratory

Local research prototype for five neural agents in one persistent Paper survival world. First curriculum: point-goal navigation on two elevated, enclosed flat courses in that world. Normal world survival remains enabled. This is an initial learning experiment, not a complete autonomous survival player.

## Run

From PowerShell in this directory:

```powershell
./scripts/Start-Lab.ps1
```

Dashboard: http://127.0.0.1:8000. It now guides you through **Collect examples → Train the network → Test learned behavior → Review**. Each stage explains what the bots are doing and highlights the next action. Training deliberately pauses movement; its live progress, completion notice and saved checkpoint appear on the page. No token pasting is needed in the browser: the localhost page establishes a same-site, HttpOnly session. Command-line clients still use `data/api-token`; never publish that token.

Minecraft Java **1.21.4**: Multiplayer → Direct Connection → `127.0.0.1:25565`. Select/install the matching Java Edition release in the launcher first. Human client connectivity requires manual confirmation; bot connectivity is measured separately.

For a fresh checkout, first run `./scripts/Setup.ps1 -AcceptEula` only after reading and agreeing to the Minecraft EULA. Python 3.11 and Node.js 22+ must be available. Setup downloads project-local Java and Paper and installs locked packages. First startup creates the two research courses once and preserves `data/arena.initialized` with the world. Keep that marker when restoring the world so startup does not rebuild the courses.

```powershell
./scripts/Stop-Lab.ps1
```

Shutdown pauses learning, atomically checkpoints the policy/optimizer, stops Minecraft through its console, and stops owned controller/service processes. Start the lab and bots again to recover the checkpoint and existing world. The service starts paused.

## Experiment

`./.venv/Scripts/python scripts/experiment.py` runs untrained/current-checkpoint and random evaluations, collects live teacher demonstrations, trains with behavioral cloning, and evaluates the neural student independently. A current checkpoint must not be called untrained if it has already learned. Use fresh data/checkpoint directories for independent replications; preserve existing results first. Evaluation uses 3 episodes per agent, 120 decisions maximum, 5 physics ticks per action, and deterministic per-agent task seeds. Do not run two experiment drivers simultaneously.

The teacher turns toward a supplied point goal and walks forward. It does not use pathfinding. Teacher movement is explicitly labeled. Student evaluation selects every action from a PyTorch neural network, without teacher fallback. Flat-course success does not establish obstacle avoidance or natural-terrain generalization.

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


## Autonomous navigation training

Use **Start / resume autonomous training** on the dashboard. You can close the browser while the local lab service and computer remain running. Sleeping or shutting down the computer stops progress. Pause autonomous training before taking manual control of learning. Server Stop/Restart also pauses the scheduler; resume it explicitly afterward.

Each cycle evaluates the current model on 15 seeded routes, collects 1,500 fresh teacher demonstrations on different routes, trains for 100 passes, and evaluates the candidate on the same held-out routes used for the baseline. Equal or higher scores keep the candidate; lower scores restore the protected champion, including optimizer state. Two consecutive candidate tests at 90% or better advance the stage. Different cycles use different seeds.

Stages: short routes (3–7 blocks, ±0.6 rad initial heading error), longer routes (7–14 blocks, ±1.5 rad), full turns (10–22 blocks, ±π), and long routes with full turns (20–30 blocks, ±π). Dedicated flat training/test arenas are prepared at X=160 and X=240, Y=181, Z=0; the earlier arenas are preserved. This is behavioral cloning with measured candidate selection, not reinforcement learning, architecture evolution, or autonomous survival. These small tests are promotion gates, not statistical evidence of broad generalization.

The dashboard reports phase, fresh examples, training progress, test completion, stage and comparison history. Sessions stop after 12 cycles or 6 hours, a ten-minute phase timeout, three stagnant below-threshold results, unsafe memory/disk headroom, or loss of server/bots. Completion pauses the bots after the final stage passes twice. Resume starts a fresh session at the saved stage. There is no unbounded background compute or automatic spending.

State lives in `data/curriculum.json`; protected weights and optimizer in `checkpoints/champion.pt`; examples and results retain the normal data locations. An unexpected service restart restores an interrupted candidate and restarts the comparison cycle when the scheduler was enabled. Intentional server operations pause it. Keep the computer awake yourself if you want unattended progress; no Windows power settings are changed.

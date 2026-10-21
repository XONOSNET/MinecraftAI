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

The server and dashboard bind to loopback only. Local bot identities use offline authentication. Do not change binding to LAN/public with offline mode enabled. RCON is disabled. No firewall/router/security settings were changed. EULA accepted explicitly by the operator in chat on 2026-10-21.

See ARCHITECTURE.md, RESEARCH.md, EXPERIMENTS.md, PROGRESS.md, and SYSTEM_CHANGES.md for scope and evidence.

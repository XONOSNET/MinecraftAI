# System changes — 2026-10-21

Verified Windows 11 Pro 10.0.26200, Ryzen 9 5900X (12 cores/24 threads), approximately 32 GB installed RAM, Radeon RX 5700 XT, AMD driver 32.0.21045.5002. GPU VRAM is user-specified 8 GB; not independently measured. No CUDA assumed.

All installations are project-local: Java 21 Temurin JRE from Adoptium official API/GitHub release (SHA256 verified), Paper 1.21.4 build 232 from official Paper fill API (SHA256 verified), Python 3.11 virtual environment with CPU PyTorch 2.14.1, FastAPI, uvicorn, NumPy, psutil, pytest, matplotlib; npm CLI from official registry; Mineflayer 4.39.0 and lockfile dependencies. Mineflayer was upgraded from 4.33.0 after live testing exposed a changed transitive velocity-packet representation. Existing Node v24.19.0, Python 3.11.9 and Git reused. No global PATH, registry, firewall, security settings, public hosting, paid service, or boot task modified. Download metadata stored under data/. Reinstallation script uses lockfiles and checks Java/Paper SHA256.

Operator explicitly agreed to Minecraft EULA in chat. server/eula.txt set true. Minecraft online-mode=false is restricted by server-ip=127.0.0.1; five bots use local offline identities. RCON disabled. Do not expose this configuration to a network.

Created a new persistent survival world (seed 74219083) and two enclosed 41×41 navigation floors at y=180 around x=0 and x=80; these chunks are force-loaded. No unrelated files changed. Configuration templates reside in config/. Setup preserves existing configs and backs up an existing EULA before replacing it.

npm audit reports six moderate transitive advisories, primarily UUID/auth dependency chains. The suggested force fix downgrades Mineflayer to 1.4.0 and would break current protocol support; not applied. Offline bot authentication bypasses those login flows, but advisories remain and should be rechecked before enabling authenticated network operation.

Dashboard update: restarted the existing local lab to load background-training progress endpoints and the guided interface. No new dependency or system-level installation. Local browser authentication now uses an HttpOnly, SameSite=Strict session; API tokens and loopback bindings are preserved. The updated workflow was exercised using the existing collected examples; checkpoints and the persistent world remain local.



LAN enabled through config/lan.json and a bounded subnet-restricted TCP bridge. Added Windows inbound rule MinecraftAILab-LAN-25565 for TCP 25565, local 192.168.1.24, remote 192.168.1.0/24, Ethernet2, profiles Any (existing Public network category unchanged), edge traversal blocked. Receipt: data/lan-firewall-result.json; prior properties backed up in backups/. Dashboard and RCON remain inaccessible from LAN. Installed official ViaVersion 5.12.1, SHA256 b8033807e7182c35003a45962352dd642c1e91880ca281da3a43cb6f481a95a2. Added pinned installation to Setup.ps1. Granted Xonosnet OP level 4 via console; verified server/ops.json.


Added local autonomous curriculum scheduling, authenticated start/pause endpoints, dashboard progress/results, persistent curriculum state and a protected champion checkpoint. Reused existing dependencies, arenas and CPU training limits. No cloud service, recurring Codex task, spending, OS scheduler, or power-setting changes. Restarted the lab to deploy the scheduler; world, demonstrations and operator privileges preserved.


Broader curriculum implementation adds no dependency or external service. Added independent skill checkpoints/replays and config/curriculum-permissions.json for visible practice oak-log harvesting and bread consumption only. General config/permissions.json remains unchanged. Extended owned practice areas to X=320/480, Y=180 floor, Z=-6..54; per-bot reset regions do not touch human inventories or external builds. Changed practice floors to sea lanterns and remove scoped hostile mobs/phantoms to prevent creeper damage from invalidating experiments; no global gamerule, difficulty, weather or user game-mode changes. Fixed teleport yaw conversion and practice bounds. Restarted the existing lab to deploy controller/backend changes, preserving navigation data/history, world and operator privileges.


Observer/cohort expansion: added config/agents.json, count 8 and 3 episodes per agent, accepted range 1–10. Broader owned practice lanes extend to Z=90; construction is chunked below vanilla fill limits. Added persistent opt-in spectator sessions and invisible tagged return/camera entities, scoped to named viewers. Stop restores prior game mode and position; no new OP grants. Added 16 curriculum stages and an independent integration policy, preserving earlier stage IDs/history. Existing checkpoints, demonstrations and world were saved before deployment; the saved curriculum stage was retained. No new dependency, network exposure, firewall change, public upload, scheduled job or power-setting change.


Arena protection/feedback correction: live logs confirmed phantom kills while learning was paused. Added always-on local practice cleanup and high sea-lantern canopies (Y=224) over owned elevated arenas. Canopies remain outside the policy's shelter sensor and camera limits. No global difficulty, weather, time or spawning rule change. Backed up live server.properties and set broadcast-console-to-ops=false in it and the source template, preserving normal player command feedback. Deployed with a graceful lab restart; models, demonstrations, curriculum stage, and enabled human follow settings retained. Observer transfer handling explicitly relocates the viewer and delays reattachment for chunk loading. Appended eight bounded terrain courses (40 total) and an independent terrain policy; stage IDs/history are preserved.

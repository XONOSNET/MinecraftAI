# System changes — 2026-10-21

Verified Windows 11 Pro 10.0.26200, Ryzen 9 5900X (12 cores/24 threads), approximately 32 GB installed RAM, Radeon RX 5700 XT, AMD driver 32.0.21045.5002. GPU VRAM is user-specified 8 GB; not independently measured. No CUDA assumed.

All installations are project-local: Java 21 Temurin JRE from Adoptium official API/GitHub release (SHA256 verified), Paper 1.21.4 build 232 from official Paper fill API (SHA256 verified), Python 3.11 virtual environment with CPU PyTorch 2.14.1, FastAPI, uvicorn, NumPy, psutil, pytest, matplotlib; npm CLI from official registry; Mineflayer 4.39.0 and lockfile dependencies. Mineflayer was upgraded from 4.33.0 after live testing exposed a changed transitive velocity-packet representation. Existing Node v24.19.0, Python 3.11.9 and Git reused. No global PATH, registry, firewall, security settings, public hosting, paid service, or boot task modified. Download metadata stored under data/. Reinstallation script uses lockfiles and checks Java/Paper SHA256.

Operator explicitly agreed to Minecraft EULA in chat. server/eula.txt set true. Minecraft online-mode=false is restricted by server-ip=127.0.0.1; five bots use local offline identities. RCON disabled. Do not expose this configuration to a network.

Created a new persistent survival world (seed 74219083) and two enclosed 41×41 navigation floors at y=180 around x=0 and x=80; these chunks are force-loaded. No unrelated files changed. Configuration templates reside in config/. Setup preserves existing configs and backs up an existing EULA before replacing it.

npm audit reports six moderate transitive advisories, primarily UUID/auth dependency chains. The suggested force fix downgrades Mineflayer to 1.4.0 and would break current protocol support; not applied. Offline bot authentication bypasses those login flows, but advisories remain and should be rechecked before enabling authenticated network operation.


# Persistent home pilot

## First-release scope and acceptance protocol

The pilot is explicitly enabled and uses one identity, `HomeAI01`, in a separate
NORMAL Paper world named `lab_persistent_pilot`. It shares the existing JVM to
avoid the cost of a second server, but has its own terrain, storage, spawn,
clock and survival consequences. No trial reset or livestock replenishment
operates in that world. The first release uses the existing small house and
controller helpers; it is controller-assisted survival, not evidence of new
neural learning.

Initial inspection on November 25 found Paper PID 143464 ready with eight bots,
comparison 562 evaluating, and about 88.9% system RAM. No live rollout or
fixture worker was found. Production settings were Night 3, site 3, size 128,
with automatic progression enabled. The two unrelated edits in
`lab/dashboard_lan.py` and `scripts/verify_plot_flowers_native.cjs` are preserved.

### Acceptance checks fixed before destructive testing

1. State is bound to the actual world UUID, player UUID and identity. Interrupted
   writes recover; cross-world and stale concurrent writers are refused.
2. Disconnect/reconnect and controller restart retain the same home and
   unfinished intention. Position, inventory, routes and remembered structures
   are rechecked against the world.
3. A genuine bed interaction registers a native, non-forced respawn point.
   Death with a valid bed preserves the home record and uses actual post-respawn
   inventory. No items or recovery teleport may be supplied.
4. Destroying that bed results in the realm's world-spawn fallback. The bot
   performs a checked return or builds and physically verifies useful temporary
   shelter, then resumes a useful goal. A fallback message alone is insufficient.
5. A damaged access route or house component produces targeted real-material
   repair. Existing sound components are retained.
6. Unavailable resources, unsafe routes, repeated death and stalled actions
   cause bounded replanning and explicit backoff. Low health/hunger alone never
   ends the continuing life. Verified shelter watches are separate from stalls.
7. Production time commands do not reset the pilot clock. Pilot sleepers and
   fixture actors do not affect production's sleep quorum.
8. The continuing demonstration targets 168,000 connected, observed Minecraft
   ticks: seven actual 24,000-tick days at the ordinary server tick rate. Native
   bed skips are reported separately through the world day clock. No artificial
   time acceleration counts. Interruptions and unobserved intervals are recorded.

Destructive conditions use separate `lab_pilot_fixture_*` worlds and fixture
identities. Setup structures, supplied test items, forced test deaths and test
positioning are recorded as setup, not autonomous achievements. The continuing
world starts with vanilla player inventory and must acquire and craft its own
home, tools, food, storage and replacement materials.

The plugin preserves valid native bed spawns. For a missing bed it selects the
assigned realm's world spawn during the server respawn event, so the bot never
falls through into production's primary world. This is the realm's spawn rule;
there is no post-respawn home teleport or administrative `/spawnpoint` recovery.
Global command-driven time skips are cancelled only for owned pilot worlds.

No pilot infrastructure is enabled on a fresh installation until an explicit
start. Persisted prior enablement may resume the same continuing world after
service restarts. Resource pressure suspends the pilot rather than stopping
production training. Worlds, runtime state, logs and binaries remain local.

## Operation and durable records

The optional plugin is built with an already installed JDK and the project's
cached Paper API using `scripts/Build-PilotPlugin.ps1`. It is inert until an
explicit owned world is created or loaded. Installing its JAR and the Python
broker requires a saved, coordinated Paper/backend restart at a completed
comparison boundary. Do not hot-load it or interrupt an active comparison.

After installation, run `scripts/Start-PersistentPilot.ps1 -Enable`. Controls
are at `http://127.0.0.1:8100`. Start/resume retains the same world and identity;
Stop pauses only the resident and saves/unloads its realm when viewers permit.
`scripts/Stop-PersistentPilot.ps1` performs the same pause. Starting the service
without `-Enable` opens controls; on first use the resident remains disabled.
A previously enabled service reconnects after a controller/backend restart.
It respects an intentional lab shutdown and never starts production itself.

To watch, stop the existing lab camera follow, join the Minecraft server, enter
spectator mode, and use `/tp xonosnet HomeAI01`. `/spectate HomeAI01` then follows
the resident; `/spectate` releases that view. This moves the human viewer only. The pilot's control
page shows its current priority, physical home checks, inventory, interruptions,
recovery counts and connected-day clock. Its controls are loopback-only.

Local data is stored in:

- `server/lab_persistent_pilot/`: persistent terrain and ordinary Minecraft
  consequences; player data is managed by Paper.
- `server/world/playerdata/<player UUID>.dat`: Paper's shared player record,
  including inventory, location and native bed spawn. A backup must preserve
  this together with the realm, plugin ownership record and pilot memory.
- `server/plugins/PersistentPilotWorlds/config.yml`: explicit world UUID,
  membership, initial admission and native bed-event claims.
- `data/persistent-pilot/control.json`: durable enablement and expected UUIDs.
- `data/persistent-pilot/<world UUID>/HomeAI01.json`: checksummed identity/world
  memory, owned blueprint, progress, interrupted work, routes and recovery
  evidence; an atomic journal and backup recover interrupted writes.
- `data/persistent-pilot/status.json` and `logs/persistent-pilot/`: current
  view and local event evidence. Do not commit these or the world.

The goal hierarchy is survival, actual death recovery, usable shelter, food,
essential tools, targeted repair and modest supplies. Missing resources back
off so another goal can proceed. Home blocks, bed, chest contents and mine
routes are claims rechecked against loaded terrain. Physical placement,
inventory acknowledgement and native bed evidence are required. Controller
recovery improvements are separate from PyTorch training; this resident does
not call the production assignment, training or demonstration APIs.

The initial admission location is setup, not a recovery achievement. Missing
bed respawns use the realm spawn rule. Recovery thereafter uses actual walking,
checked routes, nearby visible item retrieval when justified, and genuine
temporary shelter. The plugin exposes no live item grants, destructive setup,
home teleport or forced home spawnpoint operation. Fixture-only destructive
commands reject the continuing world's name and resident identity.

## Reproduction and observation

Focused checks are `node --test tests/persistent-*.test.js` and
`.venv/Scripts/python.exe -m pytest -q tests/test_pilot_gateway.py`.
The required complete project suites remain those in `AGENTS.md`.

The disposable native host is explicitly launched with:

```powershell
.venv/Scripts/python.exe -u -m scripts.pilot_fixture_host --run --duration 1800 --output logs/pilot-fixture-host.json
```

It uses cached local Paper, one inference/controller process, a 512 MiB Java
heap and one server CPU on private ports 25571 and 8102. Three ordinary-play
preflight samples must have RAM below 84% and at least five GiB available;
the continuing stop gate is 89%. Production lifecycle changes or terrain
restoration stop it. A Windows kill-on-close job and absolute deadline own only
its JVM. Its token path is in the ignored descriptor; do not print the token.

The lifecycle verifier uses the descriptor's token file in
`PILOT_FIXTURE_TOKEN_FILE` and an unused `PILOT_FIXTURE_WORLD` name:

```powershell
node scripts/verify_persistent_pilot_native.cjs logs/persistent-pilot-native
```

`scripts/verify_persistent_pilot_bounds.cjs` checks a blocked home entrance and
missing wool in separate prepared fixtures. `scripts/verify_persistent_pilot_acquisition.cjs`
performs a ten-minute natural-terrain acquisition check with an empty inventory
and no supplied building/resources. These are separate checks, not continuing
survival days. See [the evidence record](persistent-pilot-results.md) for actual
outcomes, incomplete attempts and limitations.

The fixture reports supplied setup, actual block/inventory/bed evidence, every
scenario and cleanup separately. An interrupted or failed run is not a pass.

For the continuing demonstration, the read-only bounded observer is:

```powershell
.venv/Scripts/python.exe -u -m scripts.observe_persistent_pilot --hours 4 --output logs/persistent-pilot-seven-days
```

It never rescues, restarts or pauses the resident. It stops on seven connected,
observed Minecraft days, an intentional pilot pause, or its elapsed limit.
Seven clock days alone do not prove that all lifecycle acceptance checks passed.

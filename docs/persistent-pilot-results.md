# Persistent pilot evidence

November 25–26, 2026. This is controller-assisted continuing-life engineering,
not a learned-policy improvement result. The eight production learners remain
independent. Operational instructions and acceptance criteria are in
[persistent-pilot.md](persistent-pilot.md).

## Production baseline and isolation

The November 26 12:48 CST snapshot found Paper PID 143464 ready, all eight
production heartbeats younger than half a second, all eight trial reports on
controller `f399d8a9ddeca0fd`, comparison 569 in baseline, no pending model
restore, and comparison 568 retained. Automatic options were first-night,
Night 3, scenario 0, size 128, prepared and auto-progress enabled. System RAM
was 79.7%; F: had about 171 GiB free. No competing rollout/pilot worker was
found. The older November 25 snapshot and its scenario 2 are historical;
the deployment must preserve the actual boundary's current options.

All destructive checks used a separate cached Paper JVM, loopback 25571/8102,
512 MiB heap and one server CPU. Fixture worlds and actors were explicitly
named, with server-confirmed setup records. Houses, items and animal placement
in lifecycle fixtures are supplied conditions, not autonomous achievements.
The persistent production realm has no fixture supplies or reset operations.

The first 83.5% RAM preflight veto occurred before Java launched and was
retained. The fixture capacity budget was then explicitly fixed at RAM below
84% plus five GiB actually available, with an unchanged 89% running stop gate.
The prior idle fixture host stopped itself across a production restoration;
its report confirms JVM exit, closed Minecraft port and removed temporary
worlds. No production command was used by a native fixture.

## Native lifecycle checks

`logs/persistent-pilot-native-v8/report.json` completed all nine core checks:

| Check | Physical/server evidence |
| --- | --- |
| Disconnect/reconnect | Same world/player UUID, owned plot and unfinished intention |
| Controller restart | Reopened durable state and retained actual position/inventory |
| Stop during pending spawn inspection | Late acknowledgement did not reactivate the stopped resident |
| Private Paper process restart | Same world, home and one deposited chest item survived |
| Production-style global time command | Owned realm cancelled the command; native cancellation event and clock verified |
| Valid-bed death, then interrupted recovery | Native unforced bed registration, empty actual respawn inventory, retained recovery requirement, physical home arrival |
| Missing roof block | Actual replacement and one real plank consumed: 16 to 15 |
| Destroyed-bed death | Realm-spawn fallback, retained home, legitimate old-drop pickup, checked home return |
| Missing door and bed | Real axe/door crafting, sheep harvesting, replacement bed and native respawn confirmation |

The original complete core block used JAR
`96ce5c9cd0c0858d1d0f706736ab5df57df5955625d1bdde321ab316a758807e`.
Later fixture preparation provides four meals so an unrelated food target
cannot preempt the missing-wool test. That fixture-only change is recorded in
the setup output; it changes neither production supplies nor difficulty.

Failed or incomplete attempts remain separate:

| Evidence | Outcome and correction |
| --- | --- |
| Initial native setup | Extra memory precondition veto; no actor/world released |
| Core v2 | Native identity check refused a nonexistent Mineflayer `bot.uuid`; use authenticated protocol UUID |
| Core v3/v4 | Fixture preparation record overwritten by old controller's shutdown save; seed claims only after shutdown |
| Core v5 | Restart/storage checks passed; safe adjacent respawn location was mistaken for the bed block; now verify native BED event plus both real bed halves |
| Earlier resource layout | A supplied tree occupied realm spawn; relocated grid and verified spawn/headroom before admission |
| Core v6 | Nested native death event was mistaken for command acknowledgement; separate native-event and reply channels; fix stale telemetry getter |
| Core v7 | Legitimate pickup of older death drops violated an assumed empty inventory; record actual inventory and keep the separate verified empty-respawn case |
| Bounds v1/v2 | Fourth-meal preparation was not reliably acknowledged; explicit fixture supply now meets the prepared target |
| Bounds v3 | Blocked-entry cover passed. Wool stopped at 180 active seconds but another resource search prevented physical fallback; add durable fallback priority |
| Bounds v4 | Optimistic raw crafting did not produce the prepared axe; use existing server-authoritative crafting and read back the real output |
| Bounds v5 | Diagnosed wool repair was lost when home chunks unloaded; only 20.569 active search seconds accumulated before unrelated work/daytime cover interrupted it; retain the pending finite task |
| Bounds v6 | No start: the prior host had already yielded to production restoration and removed its token/worlds; host cleanup independently verified |

These are implementation and fixture diagnoses. They do not count as successful
continuing-world days or learning outcomes. Core v8's old recovery-duration
counter restarted on reconnect; current duration uses the original death
timestamp while keeping the independent navigation deadline unchanged.

The completed `logs/persistent-pilot-bounds-v7/report.json` then passed both
fresh bounded cases on the corrected policy. Blocked home access produced
verified dry, sealed temporary cover in 34.506 seconds while leaving the
unowned cobblestone obstruction intact. Missing wool retained its diagnosed
task after home chunks unloaded, deferred after **180.208 active seconds**, and
reached physically verified temporary shelter after **184.243 wall seconds**.
Health and food remained 20; no wool, replacement livestock or rescue was
supplied. Both fixture actors disconnected and their worlds unloaded/retired;
the host subsequently verified JVM/port/world cleanup.

The final fixture JAR is
`1253888223e631d18b7a6630766a74aae30f81b8c6b76b960f22dcaec6563f9c`.
This includes the explicit four-meal prepared loadout. Newer report files
include the exact pilot source fingerprints and shared controller revision.

`logs/persistent-pilot-native-final/report.json` repeated **all nine checks
successfully on the final policy** on November 26. Its stop race additionally
injected a rejected, obsolete spawn readback after a new connection became
ready; the stale failure could not disconnect the new session. The fixture
reported cleanup verified, and `logs/pilot-fixture-host-final.json` separately
verified the private JVM exited, its port closed, and temporary worlds were
removed before production installation.

## Unseeded natural-terrain acquisition

`logs/persistent-pilot-acquisition/report.json`: fixed seed 20261125,
`PilotTest04`, a fresh NORMAL terrain world, genuinely empty admission
inventory, zero supplied items/buildings, and a ten-minute work budget
(607.181 seconds including setup/cleanup). Mob spawning was disabled only in
this diagnostic fixture; it is not a hostile survival demonstration.

The bot selected a natural plot, harvested wood, placed a real workbench,
crafted wooden and stone tools and doors, mined at least 16 cobblestone,
smelted charcoal and made a torch kit. Samples observed 12 carried torches.
Floor and wall construction began. There were zero observed deaths and zero
rescues. At the budget boundary the enclosure was still incomplete and the
bot had entered emergency-cover work as night approached. That unfinished
fallback is not credited as verified shelter. Cleanup verified actor removal,
world unload/retirement and later private-host world deletion.

This establishes a real acquisition/construction path; it does not establish
an autonomously completed home or seven-day survival.

## Reproduction

Release checks passed: **876 JavaScript tests** with
`node --test --test-concurrency=2 tests/*.test.js`, and **577 Python tests** with
`.venv/Scripts/python.exe -m pytest -q`. The JavaScript concurrency limit bounds
test resource use; the complete project test set ran. Java 21 compilation and
dashboard script syntax also passed. These code checks are separate from
native outcomes and the continuing-world demonstration.

Build with `scripts/Build-PilotPlugin.ps1`. Launch the bounded host, read its
ignored descriptor's token-file path into `PILOT_FIXTURE_TOKEN_FILE`, then run
one verifier at a time:

```powershell
.venv/Scripts/python.exe -u -m scripts.pilot_fixture_host --run --duration 1800 --output logs/pilot-fixture-host.json
node scripts/verify_persistent_pilot_native.cjs logs/persistent-pilot-native
node scripts/verify_persistent_pilot_bounds.cjs logs/persistent-pilot-bounds
node scripts/verify_persistent_pilot_acquisition.cjs logs/persistent-pilot-acquisition
```

Use unused fixture names/suffixes for another block. The host's absolute limit
and production restore/memory guard may interrupt a block; record it as such.
Each verifier reports its own cleanup; the host separately verifies JVM/port
and temporary-world cleanup. Source fingerprints accompany the newer blocks.
Worlds, detailed logs, state files and JARs remain local.

## Continuing-world status

Production installation and the seven-day demonstration are not yet claimed
by this report. The protected installer is inert without explicit `--run` and
frozen source/artifact arguments. Optional `--prepare-world` creates or reuses
only the owned natural realm while production is protected and paused, before
resuming its fresh comparison. A preparation veto leaves production resumed
and reports the pilot as unprepared. It never admits or supplies a resident.

At 16:08 CST the user explicitly paused learning for this installation and
authorized necessary shutdowns. The verified pause was round 570,
`phase_at=1795730834.9760773`, disabled with no pending restore, healthy Paper
143464 and eight fresh bots. `--authorized-paused-phase-at` may use that exact
authorized window instead of waiting for another comparison. It does not issue
a redundant pause or accept a later, unrelated pause. All checkpoint/optimizer,
replay, identity, settings, LAN and restart verification still applies.

After verified installation, explicit pilot enablement starts `HomeAI01` and
the bounded read-only observer. Record actual observed ticks, interruptions,
physical goals, deaths, stalls and known interventions. Target 168,000 ticks;
do not count native bed calendar skips or disconnected intervals as elapsed
days. A full hostile continuing-world demonstration and its remaining limits
must be reported separately from fixtures and code tests.

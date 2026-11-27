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

Release checks passed: **877 JavaScript tests** with
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

The protected installer is inert without explicit `--run` and
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

Installation completed in the user-authorized paused window. The first
preflight cancelled before shutdown because PowerShell rounded the unquoted
pause timestamp; quoting the exact value passed the unchanged guard. The
verified rollout report is `logs/persistent-pilot-rollout.json`: checkpoint
tensors/optimizer/metadata, protected checkpoint bytes, replay, identities,
settings/options and the independent LAN proxy were unchanged. Paper changed
from PID 143464 to 134364 for the required plugin restart. Eight fresh bots
reported `f399d8a9ddeca0fd`; automatic learning resumed in progressing comparison
571 with the same Night 3/scenario 0/size 128/prepared/auto-progress options.

The natural realm was prepared **while production was paused**, in one bounded
creation attempt (about 1.6 seconds of broker time), with no actor admitted and
no items/buildings supplied. This kept world generation out of an active
comparison. Realm UUID: `8e07621d-5eba-498a-97b5-e5f77691066b`.

Initial pilot startup then exposed a transport issue: current Node fetch
ignored an explicit Host override and the narrow health endpoint correctly
returned 404. A direct `http://localhost:8000/fixture/health` URL returned 200.
The fix uses that actual authority, with a real HTTP-server regression rather
than a mocked header assumption. Only the pilot Node process restarted;
production Paper and bots stayed running. The startup timeout is retained in
`logs/persistent-pilot-milestone-startup-failed.json`; the verified recovered
state is `logs/persistent-pilot-milestone.json`.

By 16:24 CST `HomeAI01` was active with health/food 20, establishing its home,
and about **0.122 connected observed Minecraft days** recorded. No death,
rescue or completed home was claimed at that early checkpoint. The independent
four-hour read-only observer is running in
`logs/persistent-pilot-seven-days/`, targeting seven actual connected days. It
checks that the same world UUID remains in use. **At that checkpoint the seven-day
demonstration was incomplete.** Bed calendar skips, disconnected time, fixture supplies
and earlier test worlds are not counted toward it.

Next decision: use that continuing-world record to verify a genuinely acquired
usable home and identify the first recurring failure that prevents maintenance
or recovery. Do not infer long-term competence or neural improvement from the
prepared-fixture passes.

## Continuing-world result and burrow recovery correction, November 26

The bounded observer subsequently reached **7.003833 connected observed days**
in 8405.416 seconds. It retained the original world and identity, with zero
deaths, zero rescues and two observed connection interruptions. This did **not**
meet the useful-life acceptance goal: no usable home or completed goal existed.
Of 8463 active seconds, about 8202 were shelter watch. Clock survival alone is
not a successful autonomous-home demonstration.

Live inspection identified the recurring controller failure. The same normal
spiders stayed near the shaft; every visible spider within twelve blocks vetoed
departure even during daylight. Their native attack flag was clear, and loaded
body cells had sky light 12–13. A second defect prevented protected table/tool
preparation before the torch lesson milestone, despite the resident carrying
31 logs, seven planks, four sticks and a wooden axe.

The pilot now observes native spider disposition without hiding entities from
perception or collision checks. The opt-in requires a tracked 1.21.4 spawn and
versioned default metadata, no attack flag, clear weather, time 2000–10000,
loaded bright body cells and 4.5-block exposure clearance. Unknown observations,
close/attacking spiders, cave spiders and other hostiles retain the old guards.
Native metadata defaults and brightness were checked against the local exact
Paper 1.21.4 JAR (`9cd431f4b77d66a3bd565c01720dae617843684a363c4d9ad2eab590f8450819`).
Sampling stays inside the spider's 0.9-block body: the live wall-clinging spiders
touched a ceiling at y=72, and sampling exactly the top face initially mistook
that boundary for occupied solid terrain. A regression covers that actual pose.

A separate pilot-only bootstrap uses real recipes and a revalidated capped
pocket to install a workbench and craft a wooden pickaxe before the torch
milestone. It preserves the interrupted task, grants no milestones, persists
placement intent and backs off after 60 seconds or eight actions. Exit checks
still run first.

Reproduce the bounded private check with:

```powershell
.venv/Scripts/python.exe -m scripts.verify_pilot_burrow_recovery --run --duration 600 --output logs/pilot-burrow-recovery-native
```

The completed `logs/pilot-burrow-recovery-native-v6/owner-report.json` records six
passing native checks: matched old-helper refusal versus real opt-in exit and
log pickup (4.043-second exit, health 20); sealed cover at night; close-spider
refusal; cave-spider refusal; a native aggressive spider established at night
and frozen with its attack flag still set in daylight; and real table/pick
crafting followed by a successful exit. Geometry, starting supplies and test mobs
are explicitly supplied fixture conditions, not autonomous acquisition. The
512 MiB private JVM exited, its port closed and its disposable worlds were removed.

Earlier attempts remain local and separate: v1 omitted the task runtime in its
resumption harness; v2 could not establish native rain in the custom realm;
v3's floating log obstructed its pickup stance; v4 lost a file-channel response
to a Windows sharing violation; v5 did not establish the requested native
aggressive state. These are incomplete attempts. The final channel uses immutable
per-ticket files, and the final hostile control establishes real aggression
before changing to daylight. Rain refusal is unit-tested, not claimed as a
completed native rain scenario.

Verification: **925 JavaScript tests and 630 Python tests passed**. Reloading only
the resident preserved Paper PID **119540**, eight fresh production bots on
`f399d8a9ddeca0fd`, automatic learning and checkpoint file hashes. Production
does not enable the new spider observation. The live resident made its real
table and pick, left the original shaft and increased carried logs from **31 to
36**, remaining at health 20. It then sought a different refuge when a zombie
villager approached; that genuine encounter was retained. Subsequent departure
and longer home-building progress must be assessed separately. These are
controller recovery changes, not learned neural improvement.

The shoulder camera is now active for Xonosnet. The earlier verifier failure was
an incorrect effect registry key; `NightVision` fixes it. The fresh native
`logs/pilot-camera-native-recheck.json` confirms an attached display camera in
air, native viewer night vision, observer cleanup and unchanged production.

### Natural follow-through after the correction

The same resident left its second refuge at world time 2064, then resumed physical
travel and additional wood collection. Further departures and real gathering
are recorded in `logs/pilot-burrow-follow-through.jsonl`; the direct witnesses are
collected separately in `logs/pilot-burrow-follow-through-verification.json`.
This establishes repeated departure and useful work, not completed housing.
The native block used time 6000, a nine-block calm start and a 3.5-block close
control; later ceiling-contact and final clearance/window boundaries have focused
regressions and live observations. These are development checks, not a frozen
learning benchmark.

The bot eventually carried **41 logs**, but died to a spider at 22:07:14 CST
while returning through hostile terrain. Its actual spawn inventory was empty.
It died to another spider at 22:07:33, again respawning empty-handed at the same
realm spawn. After that death it built physically verified temporary cover in
**10.802 seconds**, retained home knowledge and resumed a useful recovery state.
No player teleport, item grant, mob removal, terrain reset or restored inventory
was used. The two deaths and dropped resources remain consequences in this world.

This separates the corrected daylight-spider deadlock from an unresolved hostile
encounter/cover-routing weakness. Later shelter waits explicitly identified a
visible skeleton and creeper; those real threats were not disabled. A complete
home and reliable long-term survival are still unproven. The next justified
controller study is to reproduce a fatal cover approach or premature departure
under a real attacker, using these traces, before changing combat difficulty or
equipment support. The seven-day clock result must not be relabeled a successful
home-maintenance run.

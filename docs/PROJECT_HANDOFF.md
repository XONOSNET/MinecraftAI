# Minecraft AI Laboratory handoff

Live snapshot taken at about 05:00 America/Chicago on November 14, 2026. Recheck live state at the beginning of a new thread. The project root is `F:\Projects\AIMINECRAFTPLAYER`, the publication branch is `master`, and the authorized upstream is `https://github.com/XONOSNET/MinecraftAI.git`. [Astra kickoff prompt](ASTRA_KICKOFF_PROMPT.md)

## What we are building

A local Minecraft research lab where eight bots can learn movement and survival skills from demonstrations and experience, keep improvements across training, and eventually combine those skills in natural terrain. The practical milestone is an experience-trained policy that beats a frozen teacher and the saved student on fresh, controlled encounters, retains that edge through later training cycles, and eventually transfers it to ordinary survival. A successful handoff gives the next agent a way to tell learned improvement from better route planning, an easier encounter, or a lucky group run.

The current system is a working hybrid. Learned policies choose low-level actions in specific tasks. Controllers choose goals and targets, plan checked routes, manage tools and inventory, execute recipes and construction, and arbitrate movement and safety. Much of the First Night sequence is assisted in both teacher and student runs. The eight agents share specialist weights and maintain individual observations, inventories, progress and memory. Bot identities, model identities and controller source revisions identify different things.

## Runtime and action flow

1. Windows launches the project-local Paper Minecraft server, FastAPI/PyTorch dashboard and training service, and Node/Mineflayer controller. The current server is Paper 1.21.4 on port 25565. ViaVersion permits newer Java clients. The dashboard is at `127.0.0.1:8000`. The optional Fabric inventory observer is a client-side tool for viewing and reconnecting. The training stack runs locally.
2. The Python world scheduler assigns each bot a trial, plot, boundaries, driver and behavior settings. Setup snapshots or restores terrain in verified slices, surveys the site in spectator mode, and only counts gameplay after checked ground deployment. Scoped resource maintenance belongs to setup. Natural survival uses actual gathered and crafted items.
3. `controller/index.js` owns connections and forwards state and decisions. Perception combines rays, local footing, visible entities, inventory and task context. The world planner uses permitted loaded terrain, checked movement geometry and observed resource memory. Ray sight, reach, world bounds, player/plot protection, water and recovery guards continue to apply.
4. `controller/hut_teacher.js` manages world task phases, delegates First Night and domain work, and sends learned decision calls to `/step` with an observation, specialist, and reference action. For example, world travel supplies a verified waypoint and a relative angle. The chosen action goes through the shared motor, which can amend or decline unsafe movement. Some native interactions and emergency recoveries never call the network. A displayed model preference is only one stage of action selection.
5. Teacher mode executes the reference action on applicable decisions and supplies demonstration labels. Student mode uses the relevant saved or candidate network on those decisions. The same recipe, navigation and physical safety helpers can operate in both. The service records run state, milestones and diagnostics. Terminal outcomes can remain visible after survivors or failed bots return to staging.

### Work done in First Night

Current level 3 is the `Wilderness survival` variant on natural terrain with ordinary hostile mobs. The lesson uses a 19-milestone survival chain and a configured 30-minute survival watch. Work includes discovering and harvesting wood, making a workbench and wooden tools, obtaining stone, producing stone tools, smelting charcoal, lighting the hut, stocking it, obtaining and cooking food, gathering wool, placing a real two-part bed and registering home, revisiting a remembered resource and returning, and verifying shelter through morning. Earlier support levels provide progressively more help. Other world missions cover settlement, stone age, iron age, homestead and home defense. The separate structured curriculum exercises movement, hazard avoidance, gathering, exploration, shelter, combat and other narrower skills.

Survival priority can interrupt these chains. Bots may eat, repair a damaged home, retreat to a reachable home, seek emergency cover, defend themselves, or resume an interrupted task. Staircase mining, bounded shelter work and iron prospecting exist. Evidence for a fixture or a reachable phase does not establish reliable full-night progression. Preserve water/air/current/exit checks, real inventory and terrain checks, and the physical verification required for lesson credit.

## How the models actually learn

| Path | Mechanism | Evidence it produces |
| --- | --- | --- |
| Structured skills | Teacher labels train a separate action network per skill, with protected model evaluation and stage promotion | Ability on bounded exercises |
| Automatic world learning | Saved baseline → teacher demonstrations → train candidate weights by gradient descent on labeled actions → evaluate candidate → retain or restore | A paired-in-design world comparison of bundles |
| Experimental combat autonomy | Collect real fight trajectories, update a local candidate using outcome signals, benchmark against frozen teacher and saved policy, then test retention | A potential direct test of improvement from experience |

- The core policy in `lab/model.py` is a small PyTorch MLP with a tanh hidden layer. Legacy navigation has 70 inputs and four actions. Independent skill networks use 82 inputs and seven actions. Action meanings depend on task context. `lab/service.py` uses Adam and cross-entropy for production imitation updates. Automatic world learning evaluates trained weight updates. Its search does not depend on random weight mutations. In particular, the presence of a reward on a step record does not make the production world trainer an outcome-based learner.
- World learning considers expedition, gathering, shelter and combat. A specialist needs at least 30 fresh labels in a cycle to enter the training queue. Fresh examples mix with retained replay, the earlier replay reference supports a held-out action-agreement check, and protected weights and optimizer state can be restored with replay retained. Agreement on held-out labels is an imitation guard with limited scope.
- Baseline and candidate receive the same evaluation arrangement, with behavior and First Night memory snapshots frozen for the comparison. The scheduler rejects setup and infrastructure cases under its recovery rules. It guards roster, behavior settings and start time. Keep the executable controller fixed too. The behavior configuration fingerprint and executable controller fingerprint are separate fields. Some terminal reports omit the executable revision, so cross-check rollout and earlier reports or label the version evidence incomplete.
- The production gate rejects additional final low-health outcomes (health below 10) or fewer completed sequences, can accept higher milestone progress at equal completions, and uses timing only in the all-complete case. Replay agreement falling by more than eight percentage points rejects a candidate. Eight concurrent bots in one restored world are correlated and hostile encounters vary. An acceptance decision is a bundle-level result within that comparison.
- The combat benchmark uses real fight outcomes, including wins, damage and death, and local gradient updates. It already supports two held-out zombie batches, a shielded-skeleton safety check and up to two later training cycles. Read the implementation and report schema before interpreting partial reports. The matched local run in `logs/combat-autonomy-matched/report.json` has 32 training episodes and two zombie batches with 12/12 wins in every arm. There is no completed skeleton arm or promotion result in that file. The cleaned `logs/combat-paced-smoke/report.json` records changed weights and one matched skeleton start, with one win per arm and no promotion. Arena repeatability, a sustained teacher advantage and wilderness transfer remain open.
- Model IDs and parent fingerprints in SQLite support lineage. A model registry row does not guarantee the corresponding weight file still exists. Distinguish experiment-step weights, pending candidates, retained production specialists and the benchmark champion.

## Source map

| Area | Start here |
| --- | --- |
| Project history and policies | `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `RESEARCH.md`, `EXPERIMENTS.md`, `PROGRESS.md`, `SYSTEM_CHANGES.md`. Historical counts or status claims may be stale. |
| Dashboard service and operation | `lab/service.py`, `lab/server_control.py`, `lab/dashboard_state.py`, `lab/persistence.py`, `lab/jobs.py`, `lab/minecraft_status.py`, `scripts/Watch-Lab.ps1` |
| Learning, model state and lessons | `lab/model.py`, `lab/skills.py`, `lab/world_learning.py`, `lab/world_replay.py`, `lab/evolution.py`, `lab/curriculum.py`, `lab/catalogue.py`, `lab/trial_catalogue.py`, `lab/trial_queue.py` |
| World, setup, assessment | `lab/world_training.py`, `lab/first_night.py`, `lab/world_survival.py`, `lab/terrain.py`, `lab/world_fauna.py`, `lab/camp_layout.py`, `lab/staging.py`, `controller/survey.js`, `controller/site_suitability.js` |
| Controller and observations | `controller/index.js`, `controller/perception.js`, `controller/tasks.js`, `controller/survival_observations.js`, `controller/hut_teacher.js`, `controller/first_night.js` |
| Movement and recovery | `controller/field_navigation.js`, `controller/world_navigation.js`, `controller/locomotion.js`, `controller/motion.js`, `controller/route_alignment.js`, `controller/route_smoothing.js`, `controller/checked_jump.js`, `controller/jump_attempts.js`, `controller/movement_handoff.js`, `controller/world_stall.js` |
| Water and mining | `controller/water_navigation.js`, `controller/swim_recovery.js`, `controller/air_escape.js`, `controller/water_work.js`, `controller/staircase_mining.js`, `controller/mine_hazards.js`, `controller/mine_cover_exit.js`, `controller/iron_prospect.js` |
| Resource gathering and memory | `controller/resource_scan.js`, `controller/resource_access.js`, `controller/harvest.js`, `controller/tree_target.js`, `controller/first_night_livestock.js`, `controller/wilderness_memory.js`, `controller/exploration.js`, `controller/tool_recovery.js`, `controller/reforest.js` |
| Settlement and inventory | `controller/house.js`, `controller/floor_builder.js`, `controller/door_care.js`, `controller/home_terrain.js`, `controller/home_repair.js`, `controller/house_lighting.js`, `controller/crafting.js`, `controller/furnace.js`, `controller/inventory_sync.js`, `controller/window_transfer.js` |
| Shelter and combat | `controller/shelter_policy.js`, `controller/refuge_choice.js`, `controller/emergency_burrow.js`, `controller/burrow_repair.js`, `controller/burrow_workspace.js`, `controller/shelter_work.js`, `controller/night_sleep.js`, `controller/survival_defense.js`, `controller/combat.js`, `controller/combat_readiness.js`, `controller/critical_attack.js`, `lab/combat.py` |
| Observer, HUD, streaming | `lab/dashboard.html`, `lab/brain.html`, `lab/brain.py`, `lab/observers.py`, `lab/camera_input.py`, `controller/inventory_observer.js`, `client/inventory-observer/`, `scripts/build_inventory_observer.py` |
| Config and guards | `config/agents.json`, `config/controller.json`, `config/behavior.json`, `config/behavior-schema.json`, `config/mining.json`, `config/survival-progression.json`, `config/house.json`, `config/world-resources.json`, curriculum/production permissions and LAN config |
| Testing, diagnosis and rollout | `tests/`, `scripts/verify_*_native.cjs`, `scripts/analyze_world_reliability.py`, `scripts/combat_autonomy.py`, `scripts/combat_trial.cjs`, `scripts/deploy_controller_after_comparison.py`, `scripts/Restart-Bots.ps1`; past native reports live in `docs/` and ignored reports in `logs/` |

Local runtime state includes `data/lab.sqlite` and WAL files, `data/world-training.json`, `data/world-learning.json`, `data/curriculum.json`, `data/skills/`, `data/world-replay-reference/`, `checkpoints/latest.pt`, `checkpoints/skills/`, `checkpoints/world-learning/`, `server/world*`, `logs/` and `backups/`. Preserve all of these. Recovery and persistence decisions may involve model, optimizer, replay, lineage and world state together. Keep credentials local and out of outputs.

## Live results and what they support

| Comparison | Baseline → candidate completed | Low-health outcomes | Decision |
| --- | --- | --- | --- |
| 416 | 5/8 → 5/8 | 2 → 2 | Restored, lower lesson progress |
| 418 | 4/8 → 6/8 | 2 → 1 | Retained |
| 419 | 4/8 → 3/8 | 2 → 3 | Restored |
| 420 | 3/8 → 5/8 | 3 → 3 | Retained |
| 422 | 2/8 → 6/8 | 5 → 1 | Retained, first completed comparison with the emergency-cover route fix |
| 423 | 5/8 → 5/8 | 2 → 1 | Retained, lesson progress 0.8375 → 0.8438 |

The round 422 teacher completed 6/8. The round 423 teacher completed 3/8, with retreat, mining and burrow deaths and one boundary stop. Teacher runs collect examples and are useful feasibility evidence, but do not supply the same controlled teacher arm as a dedicated benchmark. Round 423's 5/8 versus the teacher's 3/8 is not proof that a learned combat strategy outperforms the teacher. The reserved-site readiness counter was zero assessment attempts at this snapshot. Dashboard observed-night counts describe recorded exposures, not held-out transfer.

The live snapshot showed comparison 425, student baseline, run `world-1794651453090888600`. Six bots were sleeping through the required morning watch, one was in an emergency burrow, and one had died to a creeper in the burrow phase. No final round 425 result is asserted here. All eight controllers had fresh telemetry. Minecraft PID 104020 was ready, system memory was about 77%, Paper working set about 3.95 GiB, and the persistence queue was empty. TPS/MSPT were unavailable in that response. The earlier dashboard timeout recovered and restoration was seen making progress.

Controller commit `4b16fa8` (replacement bed recovery) was verified live as `4845ba27313939f0` by `logs/bed-repair-rollout.json`. That report records the unchanged Minecraft PID, restored/protected weights, eight fresh connections and a progressing fresh comparison. Seven current result rows reported that revision, and the death row omitted it. `750ccbf` (keep threat clearance when walking to emergency cover) had already been deployed and is included. No active Python deployment worker was seen when this snapshot was taken. The last bed-fix change passed 745 JavaScript tests. Field effectiveness of these fixes needs further outcomes.

## Real struggles and next priorities

1. **Weak causal evidence is the fundamental constraint.** One production comparison can promote several specialists at once. Training layouts, sequential arm order, shared mob/world state and workload variation leave room for confounds. First produce a reproducible, versioned, held-out experiment for one skill. Log executed actions and interventions so outcome learning has credit to assign.
2. **Survival losses remain material.** Repeated stop reports name zombies, skeletons and creepers during retreat, cover selection and burrow work. Audit encounter traces to see whether bots were pursuing an unsafe goal, failed to execute a valid route, or simply met a lethal encounter. Separate pre-cover exposure, actual digging/cover acknowledgement and unsafe exits. A first new-controller baseline of 2/8 followed by 6/8 for a candidate is insufficient to isolate a controller effect.
3. **Recovery loops can consume whole attempts.** Historical reports include unsafe mine landings, blocked home/crater work stances, unavailable or drifting resources, missed furnace supports, interrupted inventory transactions and failure to replace tools. One bed-placement rejection now gets another checked stance. Remaining home-repair stalls need the missing part, both supporting faces, occupied cells, rejected stances and route evidence before another geometry change. Use a replayable regression and make progress count only on real movement, placement or acquisition. Preserve resumable work and the ordinary deadline.
4. **Trial infrastructure can contaminate results.** Terrain restoration is expensive, the dashboard has intermittent timeouts, and setup can fail before a safe spawn. Check server responsiveness, queued writes, memory, and restore slice progress over time. Keep scope to owned processes. Avoid restarting healthy trials or reading the multi-gigabyte console wholesale. Attribute failures to infrastructure, setup, environmental scarcity, controller or policy only when evidence supports the label.
5. **Do the first outcome-learning experiment in combat.** Reuse the existing runner and gates. The early zombie design saturated wins, so inspect paired damage and action differences first. If the current held-out start distribution lacks headroom, justify a deterministic benchmark-only variation, freeze it before training, and keep production difficulty unchanged. If safety helpers own the deciding actions, trace their effective execution before selecting a learner or collecting more data. Mining can follow with an isolated task where the policy has a meaningful choice and where successful return is part of the outcome.

## How to take a Codex turn

- **Start with a read-only pass.** Read `AGENTS.md`, inspect branch/local changes, then take a compact status snapshot. Identify the active comparison, run, driver and stage. Review accepted and rejected comparisons and deployment reports before changing anything. Leave current unrelated edits alone. At the snapshot those were `lab/dashboard_lan.py` and `scripts/verify_plot_flowers_native.cjs`.
- **Record what changed in the world and what changed in code.** Use live snapshots for state and source fingerprints for deployed controller. Use full status history selectively for stop reports and telemetry. Make one causal hypothesis with supporting observations. If the latest change is still in its first comparable cycles, let it gather evidence unless a fresh blocker justifies intervening.
- **When modifying code, use proportionate checks.** Run focused JS or Python tests first, then the relevant full suite. Check native behavior in an isolated fixture when needed. Read the fixture's cleanup and safety code before running it. Finish or verify fixture cleanup, record what actually ran, and keep tests out of an active arena. Commit explicit completed paths and push to `origin master` under `AGENTS.md`.
- **Close a turn with evidence.** Report the exact run or comparison, verified outcome, what changed, tests, what is in production, any pending deployment and the open question. A new thread should re-read these records. Use one writer for production code, learning and rollout. A separate research thread can inspect read-only and change isolated experiment code/fixtures in coordination with the running project and check-ins.
- **For movement turns in game**, distinguish model preference from `lastNavigation.decision.selected`, the teacher reference, motor controls and actual heading/trajectory. `world_timing.js` records turn reversals, replans, target switches and phase/activity time. A high turn count alone cannot distinguish a poor action from an oscillating cue or a motor override. During a jump or water exit inspect cue retention, footing, actual landing and the movement handoff before blaming the model.

## Verify the live trial and any queued rollout

Run from the project root. All commands in this block are read-only.

```powershell
git status --short -b
git log -8 --oneline
$s = Invoke-RestMethod 'http://127.0.0.1:8000/status?compact=true' -TimeoutSec 8 -ErrorAction Stop
$w = $s.world_learning
$t = $s.world_training.session
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() / 1000
$s.server | Select-Object ready,pid,version,bots_online,ram_mib,tps,mspt
$s | Select-Object ram_percent
$s.performance.persistence
$w | Select-Object enabled,round,phase,restore_pending,options
$t | Select-Object run,driver,phase,progress,message
$w.history | Select-Object -Last 4 | ForEach-Object {
    [pscustomobject]@{ Round=$_.round; Baseline=$_.baseline.completed
        Candidate=$_.candidate.completed; UnsafeBefore=$_.baseline.unsafe
        UnsafeAfter=$_.candidate.unsafe; Accepted=$_.accepted; Reason=$_.reason }
}
$s.agents.PSObject.Properties | Where-Object Name -like 'LabAI*' | ForEach-Object {
    $r = $t.results.($_.Name)
    [pscustomobject]@{ Bot=$_.Name; Connected=$_.Value.connected
        AgeSeconds=[math]::Round($now-$_.Value.last_seen,1); State=$r.state
        Phase=$r.phase; Revision=$r.timings.controller_revision; Message=$r.message }
}
node -e "console.log(require('./controller/controller_revision'))"
Get-ChildItem logs -Filter '*rollout.json' | Sort-Object LastWriteTime -Descending |
    Select-Object -First 8 Name,LastWriteTime
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like 'python*' -and $_.CommandLine -match 'deploy.*\.py'
} | Select-Object ProcessId,CommandLine
Test-Path data/lab-stopped
```

1. If the first status call times out, retry once and check process listeners plus bounded tails of `logs/watchdog.log`, service errors and bot errors. Check restore progress a second time if it appears static. A staging bot can have fresh telemetry while its previous attempt is marked stopped or complete. On normal shelter watches, inspect health, bed/door state, time of day and watch status. When compact history is insufficient, fetch `/status?compact=false` and extract only relevant completed runs. Compare deaths, success, stall category, partial progress and time among equivalent successes.
2. Read the relevant actual rollout report and bounded stderr tail. The report can say waiting for completed comparison, restarting, verified, cancelled or error. A waiting report alone is not proof the worker is alive. Confirm its process, target comparison, expected commit/source and absence of a competing worker. A verified report is historical evidence. Compare the expected checkout revision with current live per-bot revisions and fresh progress. A newer source checkout does not mean the controller process has loaded it.
3. A behavior/controller rollout needs a fair boundary and protected models. Confirm the requested comparison is recorded as completed, no recovery is pending, and the next baseline is at safe setup. The existing helper checks these conditions, with an exact candidate run or a minimum comparison number. Use one bounded worker per deployment. Honor intentional shutdown or human pause. Use the established authenticated world-learning stop/resume flow, confirm `paused` with `restore_pending=false`, preserve the selected settings and record the current Minecraft PID. Use `scripts/Restart-Bots.ps1` for controller-only changes. Avoid manual checkpoint replacement or a full Minecraft restart for a JS-only fix.
4. Check the same Minecraft process remains ready, dashboard responds, all eight bots reconnect and report fresh telemetry, and protected weights remain intact. Resume automatic learning with the same options if it was intended to run. Verify round/run changes, progress advances and all eight controller revisions match the intended code once they report. Check the next completed baseline and candidate for equivalent settings and versions. If a worker errors after a pause, inspect where it stopped before retrying. A rollout is finished only when these checks pass.

Full source checks from root are `node --test tests/*.test.js` and `.venv/Scripts/python.exe -m pytest -q`. The bounded historical audit is `.venv/Scripts/python.exe -m scripts.analyze_world_reliability --limit 8`; use compact status for routine polling. The existing three-hour check-in remains the production monitoring cadence. Its old commit pointers are historical, so use the checkout, rollout reports and live telemetry as the current record.

## Deeper references

- [World learning](world-learning.md), [First Night](first-night.md), [Combat autonomy](combat-autonomy.md), [Model evolution](model-evolution.md)
- [Reliability development plan](reliability-development-plan.md), [Controller responsiveness](controller-responsiveness.md), [Terrain restoration](sliced-terrain-restoration.md), [Water navigation](water-navigation.md)
- [Emergency burrows](emergency-burrows.md), [Home and mine recovery](home-repair-and-mine-entrances.md), [Mining and prospecting](mining-prospecting.md), [Inventory observer](inventory-observer.md)

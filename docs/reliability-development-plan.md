# Reliability and learning development plan

Initial audit: November 4, 2026. Keep Night 3; do not introduce new difficulty.

## Evidence baseline

Read the last 12 finished sessions in the saved world-training history, ending
with `world-1793822326004051800`. These are historical diagnostic results across
controller versions and sites, not a matched before/after experiment. In-progress
and aborted comparisons are excluded.

| Driver | Completed / attempts | Completion | Median successful total |
| --- | ---: | ---: | ---: |
| Teacher | 11 / 24 | 45.8% | 2,394.4 s |
| Student, baseline and candidate combined | 35 / 72 | 48.6% | 1,833.5 s |

The teacher/student timing difference is not evidence that students are faster:
sites, policies, controller versions and mandatory watches differ.

| Failure family | Attempts | Combined failed-attempt bot-minutes |
| --- | ---: | ---: |
| Navigation or construction stalls | 19 | 310.7 |
| Death | 18 | 275.8 |
| Interaction or placement | 8 | 60.9 |
| Deadline | 2 | 118.3 |
| Supplies | 2 | 49.1 |
| Resource search | 1 | 40.2 |

Failed attempts consumed 14.25 combined bot-hours, including useful practice.
This is neither wall-clock delay nor a claim that all of that time was wasted.
Reported final idle time totals 19.35 bot-minutes; it is an incomplete lower
bound on stationary delay, not all recoverable time.

Reproduce without modifying the lab:

```powershell
.venv/Scripts/python.exe scripts/analyze_world_reliability.py --limit 12
```

Stop-message families do not by themselves establish causality. A stationary
teacher with the correct selected action and conflicting motor controls is a
controller defect. A policy selecting a hold despite a valid route is a policy
decision. A failed search does not prove resource absence. A window or placement
timeout can be geometry, contention or a missing server acknowledgement; call it
infrastructure only after process/latency/log evidence supports that conclusion.

## Iteration 1: movement ownership and repeatable diagnosis

The recurring verified defect was a task routine cancelling an airborne checked
jump. Mine exits, plot returns and floor returns had separate fixes. Optional
loot, tool work, food and task resumption remained additional competing owners.

Use a shared handoff before ordinary dispatcher work and ordinary survival
interruptions. A bounded checked jump retains movement until touchdown. Actual
threat decisions, air escape, explicit safety cancellation, death and shutdown
retain priority. Do not globally make `motor.pause()` ineffective. Do not renew
progress timers merely because an action is pending.

Expose movement owner, real jump expiry and deferred/urgent update counts.
Record a source fingerprint in per-bot timings: behavior revision previously
identified settings, not executable controller code. Historical records without
source fingerprints cannot establish identical controller versions.

Validation includes dispatcher-to-construction and tool-replacement handoffs,
unplanned falls, explicit safety cancellation and a native multi-step return
through the real dispatcher. Continue the same-controller baseline/teacher/
candidate procedure after deployment; do not treat a fixture as a full-run pass.

## Next iterations, in order

1. **Route and interaction recovery.** Reproduce the remaining plot-return and
   crafting/window failures from their actual geometry. Require an alternate
   checked stance or route after a rejection. Preserve staircase exits and task
   context. Avoid extending timeouts as the default repair. Add fixtures for the
   full gather-to-build and mine-to-home transitions.
2. **Shelter and resumption.** Repeatedly test daytime exit from cover, home access,
   interrupted wood/tool trips, and return to the original task. Verify real
   inventories, block states and outcomes. Add encounter evidence before
   attributing deaths to combat policy or shelter navigation.
3. **Teacher quality gate.** On an unchanged controller and frozen settings,
   evaluate at least three complete teacher runs with the same restored site,
   start time, roster and initial conditions. Target at least 22/24 completed,
   zero repeated controller stalls, and no unresolved repeated teacher defect.
   Then repeat on a separate held-out site. This is a development acceptance
   target, not a change to lesson success or permission to advance difficulty.
   Natural mobs still introduce variance; record encounters rather than claiming
   perfectly deterministic trials. Do not grant resources or remove threats.
4. **Demonstration quality.** `/step` currently records teacher observation/action
   labels immediately; it does not wait for successful movement or task outcome.
   Repeated stuck frames can therefore enter supervised imitation data. Audit
   those sequences by skill and outcome before changing sampling. Preserve raw
   demonstrations; create reversible training-selection rules and record counts.
   Do not remove legitimate waiting in shelter or difficult examples merely
   because they are slow. Current model training is action imitation; outcome
   comparisons protect deployment, rather than directly teaching recovery.
5. **Focused practice and replay.** Once teachers are dependable, practice weak
   transitions in short isolated survival fixtures, then evaluate transfer on
   complete survival runs. Existing replay holds back earlier examples and mixes
   fresh demonstrations with retained data. Inspect skill coverage, duplicates,
   sampling caps and held-out action agreement; do not infer success from lower
   training loss. Prefer those changes before larger models or longer training.
6. **Efficiency.** Compare only equivalent successful attempts after completion,
   survival and controller-stall rates hold steady. Report time by lesson,
   mandatory watch time, actual idle time, travel distance, route replans, turn
   reversals and recovery outcomes. The controller already records several of
   these; missing recovery outcomes and interruption attribution need explicit
   events rather than guessed values. Keep failure duration separate. Never
   shorten a survival watch or count a fast failure as a speed improvement.

## Comparison and publication discipline

Implement a few evidenced changes per iteration, with regression fixtures and
explicit acceptance results. Preserve identities, checkpoints, demonstrations,
current site/settings and unrelated changes. Restore unvalidated models before
starting a fresh same-controller comparison. Publish explicit completed paths.
Prefer bot-only reloads and verify Minecraft readiness, dashboard response,
eight fresh bot connections, and enabled, progressing learning after deployment.

The first deployed change is not proof that Night 3 is reliable. Record the new
full-run results before deciding that it improved completion or reduced time.

Iteration 1 focused validation: 601 JavaScript tests and 337 Python tests passed.
The isolated native staircase-to-construction handoff completed four rises in
2.925 seconds at full health, with 12 dispatcher updates yielding to the jump
owner. Its terrain and temporary entities were cleaned afterward. Full survival
comparisons and the repeated-teacher acceptance target remain pending.

## Replay retention correction

Round 257 produced an 8/8 baseline and a rejected 2/8 candidate. Its expedition
teacher collected 19,123 examples, exceeding the live replay capacity of 15,000.
The training report therefore had zero earlier examples and zero earlier
validation examples. This is a verified retention defect and a plausible
contributor to forgetting, not proof that it caused every candidate failure.

Before each teacher pass, capture a derived, bounded reference for each world
skill under `data/world-replay-reference/`. Training mixes this pre-teacher
reference with fresh examples even when the live deque is entirely replaced.
Up to 512 earlier examples are withheld from the training selection for the
existing action-agreement guard. References carry their comparison cycle;
missing or mismatched references fail visibly instead of silently training on
fresh data alone. Cold-start skills with no earlier examples report that fact.

The regression test covers the exact 19,123-into-15,000 overwrite case, including
reference persistence across reload, mixed training, disjoint held-out examples,
and stale/missing reference rejection. Protected weights and full survival
candidate selection remain authoritative. Raw demonstrations are preserved.

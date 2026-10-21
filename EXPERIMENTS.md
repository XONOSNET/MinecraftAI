# Experiments — 2026-10-21

## Protocol

Shared Paper 1.21.4 survival world, five genuine Mineflayer players, normal 20 TPS. Training course centered x=0; evaluation course centered x=80; both y=181 standing height. Random starts/goals are inside a 20×20 interior. Both courses are flat and enclosed. Three fixed tasks per agent, up to 120 decisions each, action interval five client physics ticks. A success requires horizontal goal distance <1.25 blocks, correct vertical level, and positive health. Agent-task seeds are 8000 + agent_index×1000 + episode_index. PyTorch, NumPy and Python RNG seed 42 in the corrected release experiment. Concurrent physics scheduling is not bitwise deterministic.

Teacher: turn toward the goal if angular error >.18 radians; otherwise forward. Neural student: argmax of four learned action logits, no teacher/pathfinding fallback. Goal data is explicitly supplied; there is no hidden destination search. Ray inputs cannot reveal blocks behind first-hit solids.

Training: live behavioral cloning, Adam lr .003, minibatches 128. Primary tiny model: 100 epochs. Budget comparison: all sizes use the same demonstration dataset, 30 epochs each, seed 42. Parameter counts: 9,604 / 99,979 / 999,979. Reward (progress-.01) is recorded but does not train the model in this release. This is imitation learning, not reinforcement learning.

The release driver refuses reused run IDs instead of mixing results silently. To replicate, assign a new run prefix in scripts/validate_release.py and preserve the previous artifact set before training. Runtime dependencies are locked. Neither Minecraft physics nor concurrent agent collisions are fully deterministic.

## Calibration history (excluded from final release comparison)

Initial smoke setup failed because arena chunks were not loaded; no results from that run are treated as evidence. Adding explicit force-loading fixed construction, and logs confirmed floor/wall blocks were placed.

A first complete experiment used body-top height (1.8 blocks) as sensor origin instead of standing eye height (1.62). It measured 0/15 untrained versus 15/15 trained after 1,526 demonstrations. All three sizes reached 15/15; random reached 1/15; heuristic 15/15. These are historical calibration measurements, not the corrected release result. The origin was corrected, a regression test added, and the full comparison repeated under a fresh policy and demonstration dataset. Calibration training and model metrics are retained in docs/calibration-*.json; raw episode rows remain in SQLite.

During recovery testing, a NumPy demonstration archive was left open and Windows prevented renaming it. Closing the archive after loading fixed the error; a full restart then validated the new-policy path.

## Scope

Held-out **locations and start/goal assignments** are tested, but course geometry remains flat. These experiments do not establish navigation around obstacles, natural-terrain generalization, spatial-memory benefit, survival competence, RL improvement, evolutionary improvement or deployment on Raspberry Pi. Larger-model success on an easy saturated task cannot justify greater deployment cost. Small samples should not be interpreted as a reliable 100% future success rate.

## Measurements and artifacts

Final measured episode summaries: docs/results.json; graph: docs/learning-results.png. CPU training sizes and timings: data/model-comparison.json; primary training: data/training-result.json. Checkpoints, portable TorchScript exports, raw demonstrations and SQLite remain local and intentionally untracked. Graphs are derived from recorded episode rows, never hypothetical values.

A ten-second five-agent calibration benchmark measured 197 decisions (19.62 population decisions/sec), 26.54% mean system CPU, 49.7% peak system RAM, ~0.58 ms mean inference and ~2.00 ms mean ray collection. These short samples include the current process load and are not long-run guarantees. Full details: docs/benchmark.json. Paper console reported 20 TPS; one sample measured 1.5 ms mean tick time over five seconds, with startup spikes visible in longer-window maxima. No accelerated TPS or power/watt result is claimed.

## Release protocol corrections

The corrected-eye-height run with Mineflayer 4.33.0 was interrupted by nonfinite player positions. Inspection showed its velocity handler read velocityX/Y/Z while the resolved minecraft-data protocol supplied velocity.x/y/z. Mineflayer 4.39.0 handles the vector representation. Runs named release-* and diagnose-* are retained for diagnostics and excluded from the final comparison. Final verified runs are named release2-* and use the locked 4.39.0 stack. They reuse the 1,525 genuine corrected-eye-height teacher observations, with fresh seeded weights for the matched untrained baseline and subsequent training. No synthetic demonstrations were substituted.

Disconnected or dead agents now terminate their episode as a failure. Earlier interrupted runs could omit incomplete lifetimes, so their partial success totals must not be interpreted as final evaluation results. The shared world continues to simulate mobs and player interactions during comparisons; it is not an exact state-replay experiment. Background survival dynamics and scheduling can influence results. Independent-seed and controlled-world replications remain necessary.

A CPU oversubscription issue appeared in worker-thread inference. Explicit one-thread inference plus pre-import OMP/MKL/OpenBLAS limits reduced a later ten-second system CPU sample to 4.61%, maintaining 18.93 population decisions/sec. Mean inference was .265 ms and mean sensor time 3.664 ms; peak system RAM was 49.1%. docs/benchmark.json contains this corrected sample. Process-tree RSS entries overlap (the service owns Java), so they must not be summed.

## Verified learning result

Using Mineflayer 4.39.0 and corrected eye-height observations, the primary 9,604-parameter policy improved from 0/15 untrained episodes to 15/15 trained episodes on the held-out course after training on 1,525 live observations. The trained primary policy averaged 17.13 decisions per episode. Its final minibatch cross-entropy was .0365 after 100 epochs; loss alone is not the success criterion.

The matched 30-epoch budget comparison measured 15/15 for 9,604, 99,979 and 999,979 parameters. Mean decision counts were 16.80, 16.80 and 16.53 respectively. All saturated the success metric; the .27-decision difference is too small and the sample too limited to establish a larger-model advantage. The heuristic measured 15/15 and 16.80 decisions. The random result is in docs/results.json.

Scientific summaries select the predeclared first three completed episodes per agent, including deaths/disconnects as failures. An older controller could retain a zero-step fourth assignment after the evaluation cap and record a later death; the raw untrained run contains that extra fourth row for LabAI0. It is outside the fixed cohort and retained in SQLite. The final controller clears inactive goals to prevent that bookkeeping error. No within-cohort failures were removed.

A final ten-second sample with the 1M policy still loaded during random-baseline collection measured 199 decisions / 10.039 s = 19.82 population decisions/sec, 3.53% mean system CPU, 50.5% peak RAM, .586 ms mean inference and 2.712 ms mean perception. This supersedes earlier benchmark snapshots in docs/benchmark.json. Both historical snapshots remain described above. No power measurement was available.

All three policies also round-trip through torch.export successfully; export sizes are 50,956 / 412,441 / 4,012,454 bytes, excluding optimizer state and external spatial memory. TorchScript files were produced for compatibility but that API emits a deprecation warning in this PyTorch version; torch.export is the preferred saved inference artifact. Neither format has been benchmarked on Raspberry Pi.

Final random baseline: 0/15 successes, 110.87 decisions per episode. The live dashboard and scientific summary now use the same fixed evaluation cohort, while raw episode counts remain available in SQLite. After final restart, paused agents continue sending lightweight position/health heartbeats so dashboard monitoring remains live without policy inference.

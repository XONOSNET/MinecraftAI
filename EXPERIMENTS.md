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

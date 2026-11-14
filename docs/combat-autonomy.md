# Combat autonomy benchmark

The benchmark uses a dedicated survival player in a temporary arena. It reads the current saved combat checkpoint once, uses the existing combat observations and seven actions, and updates a local candidate from its own fights. Wins, deaths and damage taken determine the learning signal. The teacher supplies the reference action only when running the teacher arm. Production checkpoints and replay stay under the normal scheduler. See the [frozen experiment protocol](combat-experience-protocol.md) for stop rules and sample budgets.

Run from the repository root while Minecraft and the dashboard are online and at least one player slot is available.

```powershell
.venv/Scripts/python.exe -m scripts.combat_autonomy --smoke --seed 70201 --output logs/combat-smoke
.venv/Scripts/python.exe -m scripts.combat_autonomy --protocol v1 --seed 70202 --output logs/combat-milestone --retention-cycles 2
.venv/Scripts/python.exe -m scripts.combat_evidence logs/combat-milestone/report.json --per-start
```

A full cycle trains on 32 zombie encounters. It then evaluates the teacher, saved policy and reloaded candidate on two separate batches of 12 held-out zombie starts and a batch of 12 shielded skeleton starts. The same start geometry and equipment are used in each arm. Order rotates across starts. The first proposal is chosen while the opponent is frozen, then the fixture sends release and begins the action in order on the same connection. Minecraft mob behavior and timing can still vary. The predeclared futility stop leaves later batches unspent if the first completed zombie batch makes promotion impossible.

Promotion requires no additional deaths or fewer wins against either reference. Each zombie batch must show more wins or at least one health point less mean damage across shared wins, with a nominal one-sided paired sign test at 0.05. The skeleton check requires no increase in deaths, no loss of wins and no more than one additional point of mean damage. Paired time comparisons use shared wins with equivalent damage. The runner saves exact sources, start plans, tensor fingerprints and terminal rows in the output directory. `decisions.jsonl` records observations, proposals, consumed controls, interaction acceptance, native target-hurt events and rewards. Attack requests and target-hurt packets are separate evidence and may occur in different decision windows. Invalid setup attempts abort without scoring a partial block.

If the first cycle passes, two further cycles start from the benchmark champion with its saved optimizer, frozen references and disjoint starts. Each new policy must preserve the edge over the teacher and original saved model and pass the safety check against the current champion. A rejected update leaves the champion in place. The independently matched reload block must pass as well before retention is recorded; if it fails, the prior checkpoint remains and the retention experiment stops.

This milestone measures performance in the combat arena. Wilderness transfer and retention under the production imitation-learning schedule need their own evaluation before installing a benchmark champion in production.

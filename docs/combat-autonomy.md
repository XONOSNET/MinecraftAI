# Combat autonomy benchmark

The benchmark uses a dedicated survival player in a temporary arena. It reads the current saved combat checkpoint once, uses the existing combat observations and seven actions, and updates a local candidate from its own fights. Wins, deaths and damage taken determine the learning signal. The teacher supplies the reference action only when running the teacher arm. Production checkpoints and replay stay under the normal scheduler.

Run from the repository root while Minecraft and the dashboard are online and at least one player slot is available.

```powershell
.venv/Scripts/python.exe -m scripts.combat_autonomy --smoke --output logs/combat-smoke
.venv/Scripts/python.exe -m scripts.combat_autonomy --output logs/combat-milestone --retention-cycles 2
```

A full cycle trains on 32 zombie encounters. It then evaluates the teacher, saved policy and candidate on two separate batches of 12 held-out zombie starts and a batch of 12 shielded skeleton starts. The same start geometry and equipment are used in each arm. Order rotates across starts. Minecraft mob behavior and server timing can still vary.

Promotion requires no additional deaths or fewer wins against either reference. Each zombie batch must show more wins or at least one health point less mean damage across shared wins, with a one-sided paired sign test at 0.05. The skeleton check requires no increase in deaths, no loss of wins and no more than one additional point of mean damage. Time is reported only for wins. Reports and any passing benchmark champion are saved under the output directory.

If the first cycle passes, two further cycles start from the benchmark champion and use fresh starts. Each new policy must preserve the edge over the teacher and original saved model and pass the safety check against the current champion. A rejected update leaves the champion in place. A retained advantage is recorded only if the resulting champion passes again on that cycle's fresh fights.

This milestone measures performance in the combat arena. Wilderness transfer and retention under the production imitation-learning schedule need their own evaluation before installing a benchmark champion in production.

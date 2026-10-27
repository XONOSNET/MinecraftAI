# First Night progression

Select **First Night** in the world training panel, then **Start automatic world learning**. The in-game lab menu also offers First Night. Existing settlement, iron, homestead, defense and basics sequences remain selectable. No dependencies or client mod were added.

## What the bots do

Nineteen verified milestones combine the existing shelter and stone-tool chain with food acquisition, cooking four meals, collecting white wool, crafting and physically placing a two-block bed, registering its home, revisiting a remembered resource and returning, and a survival watch. They make a wooden axe after their first four logs instead of harvesting the entire house by hand. Natural resources are accepted through line-of-sight checks. Exposed stone is mined without digging the bot’s supporting floor or tunneling blindly.

A small explicit planner interrupts work to eat, forage when food is low, or retreat from visible danger and recover before resuming the interrupted task. Cooking, recipes, building, priority selection and route planning remain software helpers. Navigation, harvesting and hunting actions use the existing small specialist networks in student mode; teacher mode records their matching demonstrations. These changes add controller competence and useful observations, not a new language model or independently learned global planning.

## Four support levels

| Level | Terrain and resources | Danger and success watch |
|---|---|---|
| 0: Supported first night | Prepared home plots, starter trees, stone station and lesson cows/sheep | Hostile removal; three-minute sheltered watch after the sequence |
| 1: Natural resource expedition | Prepared home plots; no planted trees, livestock, quarry or reserve resources | Hostile removal; three-minute sheltered watch |
| 2: Independent settlement | Survey unmodified natural terrain for a suitable flat home plot; find resources independently | Hostile removal; five-minute sheltered watch |
| 3: Wilderness survival | Natural terrain and resources; no prepared camp | Ordinary hostile mobs; remain alive for thirty minutes from deployment, observe nighttime, and finish the whole sequence |

Support level controls camp preparation, overriding the legacy Prepared camp checkbox. First Night currently uses 128 × 128 sites and restores the whole reserved area between runs, rather than only the camp ring, so depleted natural resources and changes outside camp are restored. Natural passive animals are snapshotted in server storage and restored with fresh UUIDs, original positions, ages and sheep colors (up to 32 of each of five species). This repeats the observed natural population rather than inventing extra livestock. Animal restoration keeps the site force-loaded, issues bounded command batches, checks a storage acknowledgement before deployment and removes its force loads afterward. Level zero additionally supplies stationary, individually labeled lesson livestock on safe aprons. Natural sites without accessible stone, suitable build ground, food or white sheep can fail with a resource/site limitation; this is not falsely counted as a policy failure that more training is guaranteed to solve. The overall budget is sixty minutes. Waiting safely during recovery or shelter watch does not trigger the stationary failure timer. Critical health, hunger, route failure and boundary checks remain.

Two consecutive student champion results completing at least 75% of bot sequences advance one support level and rotate among training sites 1–9. Level 3 continues across those sites. The normal collect/train/paired-student comparison protects weights and optimizer state, retains earlier replay, and rejects measured regressions. Timing remains secondary to success and safety; slower active gathering is not eliminated by a historical speed cutoff. Promotion gates measure these supported trials, not production readiness.

## Memory and recovery

Each bot keeps bounded landmark memory (96 resources/home points), up to 512 grounded road cells and 1,024 undirected connections per saved terrain site. Memory is stored with world training results and reused after restarts. Grounded movement only links adjacent cells; teleports never create road shortcuts. When ordinary route search fails, the controller can reconnect to a previously walked road, rechecking its terrain and clearance. Changed, obstructed and unloaded routes cannot be followed blindly. Survey candidates and resource approaches are throttled and bounded to limit CPU work.

Blocked resources and drops are temporarily excluded so a failed pickup does not monopolize the controller. Outdoor searches explicitly cross the hut door first. The dashboard and in-game HUD report the current priority and activity; completed/stopped bots retain the existing camera-cycle behavior. Home remains a real server-registered bed with the existing overhead marker.

Landmark memory is frozen at the beginning of a learning comparison. Baseline, teacher and candidate start from the same memory snapshot: the candidate cannot win merely because the demonstration run discovered a route. New memory remains available for subsequent cycles.

## Separate assessments

Pause automatic learning, choose a support level and use **Evaluate on a held-out site**. It selects reserved site 10 by default; selecting sites 11 or 12 evaluates those instead. First Night demonstration runs reject sites 10–12, assessments require student control, start with empty landmark memory, never persist new landmarks, and do not record imitation examples or fit models. Prior models and retained replay may already have encountered these regions in older world modes; these are reserved evaluation sites for this update, not proof of globally unseen-seed performance.

The dashboard separates completion counts by support level. History records support level, controller, failures and timings. Supported evaluations cannot certify raw survival. Carried lights, safe motor controls, route planning and crafting helpers remain active even at level 3. A future production gate should use genuinely untouched seeds and many independent starts; an isolated mechanics test or a passing prepared camp does not establish that gate.

## Verification

Automated tests cover support removal, natural-resource API restrictions, hostile sweeping, reserved-site isolation, frozen comparison memory, landmark validation, route memory, threat/food priorities, doorway exits and shelter validation. The isolated native fixture records real early-axe crafting, exposed-stone harvesting/pickup, animal combat, cooking, wool, bed placement and a resource round trip. It grants a completed base and a few fixture ingredients to isolate these mechanics; it does not train production models or certify autonomous wilderness success. See first-night-native.json for the actual latest outcome; first-night-fauna-native.json verifies passive-animal restoration separately.

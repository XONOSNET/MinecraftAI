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


## First group-run corrections

Production failures exposed a fuel assumption that the original fixture missed: cooking was allowed to select sticks, but the furnace helper supplied just one. The inspected failed furnaces contained raw beef, no remaining fuel and a 100-tick burn duration against a 200-tick cooking recipe. The helper now queues replacement fuel as it burns, including several sticks when needed. A native regression cooks real beef using sticks only.

The early workbench now uses a close placement stance and retries a rejected interaction. Already-owned tools receive their verification milestones, including the early axe. Local routes center the body beside adjacent tables/walls before taking a corner; centering waypoints retain a tighter arrival radius. A committed doorway's safe back-off is allowed outside the inward route corridor, while obstacle, support and player checks remain active. Native regressions reconstruct the reported floor-corner and doorway-start positions. See first-night-regressions-native.json. These are controller repairs, not evidence that the previous failures were all deficiencies in the neural policy.


## Travel, construction and early lighting

First Night now makes house lighting before the chest and remaining wooden-tool lessons. The bots reserve raw logs, earn furnace stone and charcoal through the normal recipes, install both wall torches, and keep a carried torch reserve for later mining. Initial stone gathering can precede charcoal; this supplies no free lighting or materials and retains all nineteen completion criteria.

Travel can take short detours for visible useful dropped items, then resume the original task. Each detour is bounded, and shelter, threats and mining exits take priority. Safe flat grid corners can be skipped only after checking the whole player footprint. Water routes retain their valid forward waypoints while bobbing and climbing onto a bank. Checked single-block gaps require supported takeoff and landing, clear jump headroom and no fluid in the gap; wider gaps remain rejected.

Unowned animals or monsters intersecting unfinished construction are cleared with real attacks. Players, bots, named animals and pets are protected. Healthy outdoor bots can briefly plant collected saplings outside every known house plot, with enough room for growth, without extending the trial's progress deadline. Neutral Endermen trigger a lowered gaze. Stopped bots have gray names in the in-game activity roster; active camera targets remain gold and other active bots teal.

Focused tests cover these behaviors. The disposable native fixtures `scripts/verify_checked_jumps_native.cjs` and `scripts/verify_early_lighting_native.cjs` validate survival jump physics and native crafting/smelting in empty sky space, then clean their blocks, items and diagnostic inventory. They do not add production resources, demonstrations or claimed lesson successes.


Water-route continuity is conditional on recent route progress. After 2.5 seconds without progress, the usual bounded replanner can check new obstacles and nearby players; surface bobbing during forward progress still retains its route. Doorway alignment also relinquishes control when its existing timeout expires, handing movement back to the checked route rather than holding until the whole attempt fails. Collision, support, player-clearance and closed-door checks remain enforced.


After the final home repair, an open door is secured from the verified room interior. A final work stance outside interaction range now routes back inside before the normal door-close interaction, then resumes the interrupted lesson. The native damaged-house fixture also checks this distant finishing position without adding milestones or relaxing repair verification.


A swimmer whose home is outside its loaded chunks may first follow a checked route prefix to nearby dry shore. This leg is limited to twelve waypoints and must pass the normal water-route checks with a dry endpoint. The searched frontier must make at least four blocks of progress toward home; the short initial leg may go sideways or away when the checked route detours around an obstruction. All-water prefixes remain rejected. Reaching this shore does not count as reaching home; the controller replans the remaining return as chunks load.

The same bounded prefix is available when a loaded, valid dry bank requires more water-capable search than one planning budget permits. A visible home chunk does not imply that its full approach is already searchable. Solid or hazardous destinations do not qualify. Each short leg is checked again, and reaching it never grants construction permission or completes the home return.

Early workbench placement treats a missing reachable supporting face as a recoverable obstruction, like a server-refused click. It tries the existing alternate approach stances, up to three placement attempts. Persistent obstruction still fails the attempt; unrelated crafting or connection errors are not swallowed.

Construction return-goal selection also accepts the route follower's verified partial return when complete bounded searches fail. This prevents the selector from discarding a valid travel prefix before movement can begin. Plot clearing and floor work still require actual arrival near the plot; selecting a distant goal never permits remote construction.

Doorway guidance remains active when the bot occupies the threshold cell even if navigation has already consumed that cell's waypoint. The next checked route point still determines crossing direction and any one-block descent. This retains clearance from the open side panel instead of stopping against it at a slightly off-center heading; it does not create doorway shortcuts from elsewhere in the house.


Plot clearing and floor building no longer fail an entire attempt on a single unsuccessful home-route check. They pause safely and re-sense for up to fifteen seconds; a verified route resumes normal travel. Persistent route failures still end with the original return-route diagnosis. Waiting adds no construction or lesson credit, does not permit remote digging, and retains the ordinary trial and stall limits.

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

Seagrass, tall seagrass, kelp and kelp plants are water-bearing swimming cells, matching vanilla physics. Surface planning can resume over these plants instead of waiting forever for an airborne swimmer to land. They never qualify as dry work footing, and a submerged plant above the feet does not count as breathable head space. Existing current, oxygen, hazard, waterlogged-obstacle and dry-exit checks remain in force.

First Night now prepares lighting before enclosing the house. Initial wood planning includes 28 plank-equivalents for the lighting kit: four retained raw logs plus twelve planks for the early pickaxe/handles and fuel margin. Actual raw logs are retained during initial crafting. After the floor, workbench and door crafting are ready, the bot mines real stone, crafts tools and a furnace, smelts charcoal and makes at least ten carried torches before starting walls and roof. The furnace sits on the finished floor, avoiding an obstruction over unfinished flooring. Prebuild mining returns do not attempt to interact with a nonexistent house door.

As soon as the indoor torch's upper-wall support exists, building pauses to install and verify that wall torch; a distant builder takes a checked interior stance before proceeding. Roof completion therefore follows indoor lighting. After enclosure, the outdoor entrance torch is installed and both mounts are verified before ordinary chest/tool supply trips. Mine torches remain carried as before. These are real inventory, recipe and placement operations; no light blocks, free torches, hostile suppression or lesson bypasses are added. Preparing lighting can delay enclosure; the ordinary night/emergency-cover behavior remains active throughout preparation.


Plot clearing and floor building no longer fail an entire attempt on a single unsuccessful home-route check. They pause safely and re-sense for up to fifteen seconds; a verified route resumes normal travel. Persistent route failures still end with the original return-route diagnosis. Waiting adds no construction or lesson credit, does not permit remote digging, and retains the ordinary trial and stall limits.

Damaged-home recovery backfills blast holes before replacing the floor and doorway. Work is bounded to the seven-by-seven house footprint and a three-wide, two-block-long entrance apron. Only exposed empty columns with a loaded, full solid base within six blocks below walking level qualify; intact floors are not excavated or used as permission to fill natural caves. Columns are filled bottom up from checked reachable stances, avoiding fluids, falling blocks, occupants and other bots' plots. Deep or inaccessible holes remain subject to the normal safe-work checks.

Backfill consumes carried dirt or ordinary solid rubble first, reserving eight cobblestone when a replacement furnace is needed. Wood gathered through the normal survival routines supplies any remaining fill and replacement house parts. The wooden floor, door, earned furnishings and lighting are then restored and verified before the interrupted task resumes. This grants no blocks and changes no lesson criteria.

Walking recovery also shares the existing physical jump-placement skill used for high logs and burrow exits. A stationary bot trapped in dry low ground can use up to three carried solid blocks beneath itself, one real jump and verified placement at a time, then replan. It first checks for an ordinary walking or one-block stepping exit, sufficient loaded headroom, safe support, player clearance and an actual upper landing reachable from the proposed column. It does not build into other homes, inside its own completed room, in water, or with falling blocks. A crater below its own floor can qualify. Home repair can request this escape when no safe work stance exists; the original interrupted task and normal failure limits remain intact.

After a one-block descent, grounded bots may consume a passed landing waypoint before a bend when the complete swept body corridor to the next flat waypoint is clear. Delayed observations can be up to 1.2 blocks past the landing. This does not skip airborne landings, gap takeoffs, doors, unsupported corners, other players or protected plots. Alignment is still required when that checked corridor is obstructed.

Shelter seeking uses the same checked surface-swimming routes as ordinary travel, including narrow shoreline cells missed by the former four-block sampling grid. Digging still requires dry, supported earth. If no path can increase separation from every attacker, the bot may take a checked escape route that avoids close hostile cells, instead of freezing in the open. It maintains buoyancy while looking for a valid bank.

When retreating, an earned intact house takes priority if it is within 32 blocks and its checked approach is no longer than 48 blocks, avoiding close hostile cells and other homes. Bots already inside their safe house stay there. Otherwise, a reachable earth refuge is the fallback. Refuge selection prefers sites twelve blocks from pursuers, but can choose closer verified earth when fleeing and no distant site is available; it does not abandon excavation merely because an attacker comes within eight blocks. A creeper or hostile occupying the actual dig site still causes reselection. From inside the shaft, bots use carried weapons or bare hands to attack reachable hostile entities blocking the lip or roof at ordinary attack cooldowns, without climbing out or pursuing. Once the opening clears, roof placement resumes. Actual sealing remains necessary before the refuge counts as safe.

Swimming recovery measures horizontal position independently of route replanning and vertical bobbing. After three seconds of attempted forward swimming without half a block of displacement, it commits to a nearby checked dry-bank route, then resumes the original destination after reaching shore. It does not convert reaching shore into lesson success. Holds chosen by the policy and steadily moving swimmers do not trigger this override. If an accidental fall or knockback leaves the bot submerged before a valid surface route can be planned, the walking controller maintains buoyancy while rechecking rather than pausing all swimming controls. Navigation reports include velocity, gravity, physics-enabled state and water state for diagnosing further physical stalls.

Mine return waits for touchdown before replanning each stair, but preserves the jump controller's forward input throughout an already committed jump. Previously the airborne wait paused that controller, cancelling forward during the ascent. A body aligned with a checked one-block rise can also jump from the block face without backing toward its previous cell center; lateral misalignment still requires centering. These changes do not permit jumping into low ceilings or unsupported landings.

Submerged bots prioritize finding air before ordinary work, loot or surface-only navigation. A bounded search over loaded source-water cells checks short horizontal and upward escape paths to breathable space, so a bot under an overhang can swim sideways before rising. This is emergency transit only; normal travel still requires checked surface routes and dry exits. It does not grant breathing time, dig an unknown escape tunnel, descend deeper, or declare a submerged pose safe. Currents, hazardous blocks, solid headroom, other players and other bots' plots remain excluded. If no checked opening is found, the bot reports that condition while continuing buoyancy and rechecking.

Mining recenters from the actual occupied cell. Crossing into an adjacent excavated cell now triggers a checked walk back to the recorded work stance, even within the former 0.65-block arrival radius. The local centering helper is used only after entering that stance cell. Successful ore removal also clears the displayed ore target, preventing an already-mined coal position from remaining marked during stance recovery. Stair supports remain protected.

After falling or being knocked into water, navigation releases a previously committed dry landing so it can replan a checked swimming route. Ordinary airborne landings still retain their route until touchdown; buoyancy must not be mistaken for a jump that has not landed.

Missing bed planks or cooking fuel now starts a short wood resupply trip and returns through the normal home entrance to resume that task. Shelter interruptions retain priority, and collected wool remains in inventory. Nightfall no longer interrupts the final door, entry or enclosure verification while a bot is inside its physically intact house shell with no hostile inside; the normal closed-door and hut verification still must finish before the lesson is awarded.

Plot-clearing and floor-building returns preserve a committed jump until touchdown, including when the jump crosses into the local construction radius. They wait before planning or working without cancelling the held forward trajectory. Unplanned falls still pause normally.

The spectator HUD header shows elapsed trial time as MM:SS below one hour and HH:MM:SS from one hour onward. It starts at the running trial timestamp, excludes terrain preparation and freezes at the recorded trial finish. Registered bed homes use a flat house glyph and owner label above the roof instead of a three-dimensional bed item.

A checked one-block climb immediately outside a door takes priority over the doorway's flat crossing alignment, including while steering toward the climb. This handles a one-cell low spot between the doorway and a raised grass bank without removing terrain or weakening landing checks.

Wood pickup treats surface swimming separately from a dry airborne landing. A collector floating under shoreline leaves first follows a checked route to a clear bank, then resumes ordinary pickup. Blocked canopy exits are rejected by the existing feet/head clearance checks. If no checked bank is available, it maintains buoyancy and retries without fabricating movement, inventory or lesson progress.


All ordinary routines now share a surface-water work handoff, including crafting, building, mining, food/wool gathering, tool recovery and returning home. Checked water travel retains its destination and policy-driven movement; an unexpected swimmer searches for a reachable clear bank. A bank climb stays committed until grounded, even after the body leaves water. The original task, resource target and lesson progress remain unchanged and resume on dry footing. Air escape runs first, and threat-driven cover/retreat and burrow logic retain ownership. Missing exits preserve buoyancy and bounded retries under the existing stall/trial limits, without granting success or supplies. Navigation telemetry includes the water-work phase and destination.

Stationary swimming recovery accumulates attempted forward-swimming time across brief alignment pauses. Turning no longer erases earlier failed movement; deliberate holds contribute no time, and half a block of real horizontal progress resets the accumulator. This prevents repeated align/swim decisions from suppressing a checked shore escape until the general trial stall timeout.

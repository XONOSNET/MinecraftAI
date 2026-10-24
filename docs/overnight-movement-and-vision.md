# Movement, vision and overnight recovery

Refresh the dashboard, then use **AI vision > Show vision cone lines in Minecraft**. Choose the followed bot (first bot when nobody is following) or all bots. The setting persists. Native particle outlines update once per second; no client mod is required.

The central 256 rays and 64 pooled policy features retain their learned layout. Sixteen peripheral rays extend horizontal awareness from 90 degrees at a distance to 150 degrees at one block or closer. Collision-box probes detect walls, low clearance and unsafe ground behind the bot. Outlines use the reported peripheral field of view with a 16-block range.

Reversing and crouching are motor safeguards shared by teacher and neural policy, not newly learned policy actions. Attempting to walk into a wall for 0.9 seconds triggers a brief reverse only when rear clearance and ground are safe, with a two-second cooldown. Crouching fits a 1.5-block opening and persists until standing is safe. Jumpable steps remain distinct from walls. Activity displays explain these behaviors. The implementation supplies the pinned 1.21.4 pose packet and corresponding local collision height; sneak alone did not enable low passage with the bundled simulator.

Policy decisions run at 10 Hz with held controls and smooth 20 Hz aiming. Small turns overlap walking; door interaction can overlap approaching. Sharp turns and hazards limit walking. Saved model input dimensions, action indices and weights remain intact. config/controller.json supports legacy controls with smooth_movement=false. Non-expedition step/stall budgets scale with the increased rate to retain previous time allowances; swimming already used 10 Hz.

Temporary memory pressure or missing bots enter a visible recovery hold. Resuming requires 30 seconds of stable connections and memory below 84%. Interrupted candidate training is cancelled, the protected model restored, then a fresh baseline starts. Critical disk pressure and repeated phase timeouts still stop for intervention. The Windows watchdog restarts missing services/bots, respects intentional shutdown and inhibits system sleep. Display sleep remains available.

Results now show average elapsed seconds; old untimed episodes show a dash. Timing does not change the learning objective. Policies still learn from demonstrations and pass success-based promotion gates. Faster movement here comes from controller improvements, not speed-weighted training or reinforcement learning.

## Verification

- All 21 saved model tensor fingerprints matched before training resumed.
- Paired legacy/smooth checks: 64/64 passed with each profile. Door policy batch: 18.14 to 10.12 seconds. Staircase teacher batch: 48.45 to 14.81 seconds. Step counts are not directly comparable across rates.
- Harvesting, exploration, swimming, waterfall and cottage references: 40/40.
- After obstacle-awareness changes: 24/24 teacher door/staircase/lava trials and 32/32 neural navigation/door trials.
- Native fixture: physical reversing, 5.49 blocks of crouch travel under a 1.5-block ceiling, and a 150-degree cone. See vision-native.json. Paper accepted particle commands.
- Recovery tests include a simulated 20-hour run, memory hysteresis, cancellation/restore ordering and manual-pause preservation. A live controller outage checks the installed watchdog and automatic resume; see overnight-recovery-native.json.

Unit suites: .venv/Scripts/python.exe -m pytest -q and node --test tests/*.test.js. Native checks: scripts/verify_locomotion.py and node scripts/verify_vision_native.cjs. Pause autonomy first. The collision fixture temporarily grants LabMotorTest operator access, removes it in cleanup and clears its isolated test blocks.

## Recovery after repeated collisions

Reversing now leads into a committed local detour instead of immediately returning steering to the policy. Seven candidate headings are checked for standing body clearance and full supported ground out to two blocks. Lava, fire, water, missing chunks and unsupported edges reject routes. Recovery turns toward a checked exit, then commits to a detour of up to 1.5 blocks. It can release earlier after at least 0.35 blocks when collision and support probes confirm the observed checkpoint path is clear, preventing overshoot beside narrow doorways. It rechecks the forward path while moving. Among safe exits the already observed checkpoint bearing breaks ties; arena bounds reject exits outside the practice area. Swimming and climbing remain under their existing controls rather than invoking land detours. A stalled detour tries another exit; three unsuccessful choices or five seconds without recovery hold movement until the existing trial reset.

A bounded 12-second memory records the blocked heading and position after a completed detour. Approaching the same obstruction within 2.5 blocks starts another detour without repeating the reverse loop. A clear parallel path remains available, and a consistent preferred side reduces left/right oscillation. Pauses, trial resets and stale policy responses clear recovery state. The same motor safeguards apply to teacher demonstrations and neural review; they do not change saved model dimensions or claim that the network learned a new strategy.

Native recovery fixture: see recovery-native.json for a completed physical detour followed by a crouch passage. The activity display shows turning toward clear space, detouring, checking another exit, or waiting for reset when no safe exit exists. Final teacher-free navigation, door and swimming checks are recorded in locomotion-recovery-final-student.json.

Final regression: 40/40 teacher-free trials passed (24 navigation, 8 wooden-door, 8 Swimming basics 2). Unit verification covered 55 Node tests and 56 observer/vision Python tests. Both HTTP localhost and HTTPS LAN dashboard routes returned 200, and autonomous review resumed with all eight bots.

## Doorway alignment

Door frames now use a separate local motor alignment step instead of broad wall detours. The bot picks an entry side once, aligns with the usable opening (including the rotated open-door panel), waits for the policy's existing door-open action, then creeps through until its body clears the far side. Policy turn choices cannot flip the approach side in the middle of crossing. Collision and supported-ground checks still gate every movement; a blocked crossing times out visibly and waits for the normal trial reset. Finished doors cannot retrigger during the same trial. This is shared motor assistance, not a claim that the policy learned a new action.

The native single-door, two-door and three-alternating-door policy checks passed 24/24; see locomotion-doorway-student.json. Unit checks also cover reverse-side entry, north/south orientation, closed doors, unsafe paths, timeout/reset and open-panel clearance.

## Stage 123: raised bridge exit

The bridge ends one block above the second doorway's landing. The doorway motor's same-height ground requirement and held sneak prevented that legal descent. It now permits a fully probed descent of at most one block when approaching a lower doorway, releasing sneak for the step. Full footprint support, body clearance and landing/fall hazard checks remain required. Deep drops and hazardous/unloaded landings are rejected, and ordinary wall recovery retains its same-height restrictions.

Door-frame snags can now be corrected sideways while retaining the original crossing side. Short centering movements probe only their actual target distance so the opposite jamb does not incorrectly block a small correction. No stage geometry, success criteria, promotion threshold or model dimensions were changed. Native three-trial-per-bot teacher and policy results are in locomotion-stage123-final-teacher.json and locomotion-stage123-final-student.json.

Validation: 62 Node tests passed. The final native policy test passed 24/24 stage-123 trials; the teacher reference passed 23/24. After resuming, the curriculum passed its normal two review gates and automatically promoted to stage 124 (Three doors across mixed surfaces) with all eight bots connected. See stage123-promotion.json.

## Stage 125: collision-surface support

The soul-sand approach places the bots' feet at Y=180.875. The previous support check required a block shape ending at height 1, so it incorrectly held every bot crouched before the first door. Support queries now resolve the actual collision surface at all four footprint corners. They allow normal small steps up to the simulator's 0.6-block step height and conservative small descents; the existing lower-door exception still permits a checked one-block landing. Body clearance is evaluated at the resulting support height. Doorway queries use the crouched body height; ordinary recovery continues to require standing clearance. Hazard checks span the landing and body corridor, and missing support/chunks reject movement.

Unit regressions use real 1.21.4 soul-sand, stone and slab collision shapes, plus low-ceiling, deep-drop, fire and lava checks. Models, observation dimensions, stage layout, success criteria and promotion thresholds were preserved. Native teacher/policy results are in locomotion-stage125-teacher.json and locomotion-stage125-student.json; ordinary-door and stage-123 regressions are in locomotion-collision-surfaces-student.json.

Validation for collision-surface support: 64 Node tests passed. Stage 125 policy trials passed 24/24, teacher references passed 23/24, and ordinary-door/stage-123 regressions passed 16/16. Automatic training resumed under the existing review and promotion rules.

After its automatic refresher, the curriculum passed both normal stage-125 review gates and promoted to stage 126 with all eight bots connected. See stage125-promotion.json.

## Upright doorways and local-search diagnostics

Doorway assistance no longer uses sneak as a general speed limiter. It first probes standing clearance, crouches only when the lower body fits and the standing body does not, and brakes near its alignment target at physics-tick frequency. The existing forced-low-ceiling pose and checked step-down behavior remain available.

The old "no safe exit" text came from a bounded motor search, not a learned impossibility prediction. A policy can still need practice to avoid hitting a wall, while the fallback can independently miss a valid route. The earlier report could not be replayed from current telemetry. Recovery now probes thirteen side/rear headings instead of seven, tries a shorter supported reposition when no long straight move fits, and performs bounded rechecks before holding for reset. Arena limits use the checked move span. Labels distinguish no checked local route, time budget, retry budget and movement permissions. This remains local recovery, not full-world path planning or proof that a course is impassable.

Validation: 68 Node tests passed, including a newly appearing route after recheck, an alcove with only a short move, standing-door braking and genuine low-clearance crouching. Policy tests passed 24/24 across a wooden door, three alternating doors and the raised ice bridge gauntlet; see locomotion-upright-student.json. The native collision fixture crossed an ordinary doorway with zero crouched movement samples, completed a wall detour, then crouched through a 1.5-block passage; see upright-recovery-native.json. Existing models and promotion gates were retained.

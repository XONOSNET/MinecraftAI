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

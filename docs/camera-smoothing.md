# Smoother external camera motion

The action camera's smoothstep interpolation previously decelerated to zero angular speed at every 12-second shot boundary. Travel-heading updates also used a fixed angular step, abruptly starting and stopping side/trail camera movement.

Action framing now uses bounded monotone cubic interpolation for radius and height, with continuous angular travel through all eight shots and across the loop boundary. Camera travel bearing eases its angular velocity using elapsed time, follows the shortest turn and resets its velocity after arena/target transfers. Bot head movement remains excluded from that bearing.

Native display teleport interpolation increased from two to four ticks (100 to 200ms). The independent 20Hz camera worker still uses server-relative live target positions, not delayed dashboard telemetry. New camera entities still spawn with zero interpolation at their already-oriented torso-facing offset; interpolation starts before attachment. This preserves safe arena/respawn cuts rather than blending a camera across the world. First-person viewing continues to use Minecraft's direct spectator attachment.

Validation: all 299 Python tests passed, including frame continuity, nonzero/continuous velocity at shot boundaries, bounded framing at short/long camera distances, eased heading limits/wrap, transfer handling and independent worker behavior. After deployment, the native six-view switch test passed with downward torso-facing spawn rotations (docs/camera-initial-angle-check.json). Perceived smoothness still depends on client frame rate and network delivery; protocol tests cannot judge the stream's appearance.

Applying the Python service change required a standard lab restart. Models, learning options and observer preferences were preserved, eight agents reconnected and automatic world learning resumed at the existing site/support level. No motor or policy code changed.

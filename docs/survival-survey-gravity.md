# Prevent survey reconnect loops

Survival bots were being kicked with `multiplayer.disconnect.flying` while
waiting for natural terrain chunks. The survey helper zeroed gravity and
velocity on every controller tick, leaving survival players hovering long
enough to trigger Minecraft's anti-flight check. Reconnecting restarted that
survey wait, creating another kick cycle.

Only spectator-mode surveys now suspend gravity. Survival players retain normal
physics and the existing server-issued slow-falling effect until a checked
ground spawn is ready. Switching out of spectator mode also releases any old
survey gravity hold. Server flight checks remain enabled.

Validation: 482 JavaScript tests, including survival surveys, unknown game modes,
spectator gravity restoration and a spectator-to-survival transition.

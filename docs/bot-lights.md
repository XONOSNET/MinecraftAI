# Following lights

Moving level-14 lights are disabled in `config/bot-lights.json` with
`{"enabled": false}`. This setting reloads while the service runs; future
on/off changes need no restart. Disabling removes only owned moving-light cells
and their markers, including old markers when their chunks load. Household
wall torches and unrelated world lighting are preserved.

The status endpoint exposes `bot_lights.enabled` and `bot_lights.active_cells`.

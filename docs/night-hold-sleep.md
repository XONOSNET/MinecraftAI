# Bed use during the First Night shelter watch

`night_hold` checks the actual enclosure and closes the entrance before trying
the bot's own home bed. During daytime it reports that it is waiting for night.
At night it walks to its own bedside if necessary and uses Mineflayer's normal
sleep interaction, including server confirmation. It never changes server time,
the sleeping-player threshold, resources, or survival mode.

Occupied/missing beds, blocked approaches, nearby monsters, and server refusals
leave the bot sheltered with a visible reason. Failed attempts retry after ten
seconds. Beds are never activated outside the Overworld. Sleeping bots pause;
food/recovery work waits for waking, and stopped attempts also request waking.

Completion requires an observed night during this watch followed by daytime,
server-confirmed waking, the existing watch-duration criterion, health >= 12,
food >= 10, an intact enclosure, and a closed door. Prior nighttime resource
gathering cannot satisfy the watch's morning check. Sleeping alone does not
credit success. Other awake players can keep the server from skipping night;
the bots then remain in their beds until morning normally arrives.

Status messages flow through the existing dashboard/in-game activity report.
The wilderness report also includes `sleep.status`, `sleep.night_seen`, and
`sleep.morning_seen`.

Validation: `node --test tests/*.test.js` (349 passing). The isolated native
fixture `node scripts/verify_night_sleep_native.cjs` creates a temporary bed
platform in verified empty sky and tests in survival, then removes its fixture.
On this rollout the server had passed the sleeping window, so the native check
verified the daytime wait and actual Mineflayer daytime refusal. Confirmed
sleep/wake, dawn gating, occupied beds, retries, interrupted meals, and retained
watch timers are covered by focused automated tests; a natural-night live sleep
remains to be observed. No training data or global time is written by the fixture.

## Spectator countdown bar

While watching a bot in `night_hold`, a third purple bossbar displays its name
and remaining shelter-watch time as minutes and seconds. It shrinks toward
zero. If the timer expires before the lesson finishes, the bar stays visible
at `0:00` and shows the reported sleep/watch status (for example, waiting for
morning). It hides when switching to a bot
outside the watch, on completion/stop, while paused/training, during restoration,
or when bot telemetry is unavailable. Sleeping through the night does not reset
or bypass the watch timer.

The controller reports `watch_seconds_left`, `watch_seconds_total`, and
`watch_updated_at` in `wilderness.sleep`. The HUD uses that timestamp to keep
the visible countdown moving between reports. It reuses the otherwise hidden
third status bar, with the existing route/stall display available outside the
shelter watch; stopping observation removes all bars.

Original validation of this HUD addition: 311 Python and 364 JavaScript tests passed. A
diagnostic Minecraft client received the actual bossbar packets, verified the
watch label and decreasing fill, then verified the bar disappeared on expiry.
Its temporary bars and operator privilege were removed afterward. Evidence:
`logs/watch-hud-native.json`. No production survival results were fabricated.

November 1 countdown visibility fix: live inspection found the selected bot and
two other bots still sleeping in `night_hold` with zero seconds left, while
another bot still had 100 seconds remaining. The old expiry rule explained the
intermittent disappearance. Updated HUD tests cover both a reported zero and
timestamp interpolation reaching zero before dawn, and confirmed completion
hiding the bar. All 315 Python tests passed. This display-only fix is committed
for the next normal lab restart; the running service and current trial were
left uninterrupted. Survival criteria and controller behavior are unchanged.

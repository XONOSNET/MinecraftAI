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

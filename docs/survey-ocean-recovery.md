# Survey ocean recovery

Automatic learning advanced from support level 0 after a seven-of-eight student completion, then selected scenario 2 at level 1. The next baseline and teacher batches all stopped during the scripted survey with "No safe natural spawn found." These were setup failures, not evidence that the movement policies had learned to float.

Bots were switched into survival and dropped at the center from y=196 before a dry spawn had been found. Survey code paused movement, so they could fall into the ocean while searching. Its old search covered only the central 48-block square.

Survey now uses server-authorized spectator mode and temporarily suspends client gravity without disabling physics ticks or terrain loading. It restores gravity when a safe spawn is applied, on a stopped survey, on leaving world mode or on controller error. The server teleports first and switches back into survival afterward. The dry-ground search extends across loaded terrain with the prepared camp's required boundary margin; attempts are throttled to once per second. Once a bot establishes the shared camp, its anchor is immediately shared with the other bots.

When all bots fail the scripted site survey, automatic learning discards that setup failure without training, scoring or promotion, restores any unvalidated models, and tries another site at the same support level. Reserved assessment sites are excluded from First Night training fallback. Exhausting all nine training sites produces an explicit error rather than looping indefinitely. Actual skill failures and mixed-outcome trials retain normal evaluation behavior.

Live read-only verification above the reported site found a safe shore spawn at [24618.5,65.1,16480.5], outside the old search area. Of 169 sea-level samples, 98 were water. Hover height remained exactly y=196 for six seconds with controller physics still enabled. Returning to the existing sky pad restored gravity to 0.08 and normal grounded movement. No terrain, inventory or model edits were used for this verification; see survey-ocean-native.json.

Validation: 215 JavaScript tests and 246 Python tests passed. These checks establish safe survey mechanics and site fallback, not completion of the harder level 1 survival sequence.

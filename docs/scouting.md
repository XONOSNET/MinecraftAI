# First Night scouting correction

The rejected round 119 student completed 2/8 sequences. Three bots had built beds but failed to choose a remembered resource landmark for their return trip. Their static memories were present; repeated upper logs consumed the nearest-resource shortlist, mining-height approach generation missed the ground below them, and retries revisited the same shortlist.

Scouting now groups vertical resource sightings by site, considers confirmed harvesting stances, nearby walked ground and currently standable terrain beneath the observed resource. It checks at most four distinct approaches per planning tick and keeps its cursor across retries. Private plots, bounds, current footing and the shared safe route planner still apply. Scouting does not require mining the resource again. Credit still requires physically visiting the selected site and returning home.

Successful harvesting records a confirmed stance for use later in the same trial. Cross-trial sanitized memories still retain resource positions and roads; ground discovery supports these older memories. Reports include approaches checked, total candidates and chosen landmark. No additional resources or completion credit are granted by the fix.

Validation: 297 JavaScript tests passed, including four new regressions for high logs, advancing past blocked candidates, private plots and stance validation. The live diagnostic replayed saved memories and starting positions for LabAI1, LabAI2 and LabAI3 against the currently restored terrain. All three reached a landmark and returned home (25.160, 7.823 and 13.321 seconds). This tests the scripted scouting route, not neural-policy improvement or an exact replay of the old terrain. See scouting-native.json and scripts/verify_scouting_native.cjs.

Deployment: paused learning, confirmed protected models restored, restarted only the bot controller, verified eight fresh connections and a single controller process, and resumed a fresh comparison at scenario 2, size 128, First Night support level 1.

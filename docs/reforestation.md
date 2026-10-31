# Opportunistic reforestation

World-trial bots reuse saplings they actually pick up. Between completed outdoor
wood-gathering actions, a healthy, fed, grounded and stationary bot can plant at
a random suitable location within arm's reach. It never walks elsewhere to plant,
stops movement, interrupts mining/combat, clears a site, or creates supplies.
Checks are throttled to five seconds; attempts have a random 30–60 second
cooldown. Repeated planting cannot keep an otherwise stalled gatherer busy.

Sites must have suitable soil, tree growth clearance, daylight potential, line
of sight and no nearby players, miners, route waypoints, trunks or other saplings.
The bot waits until all house plots are known. Every bot's yard is excluded with
an additional three-block canopy buffer (eight blocks from house centers), as
is a four-block strip along the trial boundary. No spot means keep the sapling
and continue normal work. Planting never replaces vegetation or constructed
blocks. The previous tool is restored without a camera/head turn.

All `_sapling` items are supported, plus mangrove propagules and azaleas. Dark oak
and pale oak wait for four saplings and use a 2×2 group. A partially placed group
can be finished on a later safe opportunity using its remaining supplies.
Server-confirmed blocks alone count as planted; failure remains optional and
does not stop the bot's trial. The activity message briefly reports planting.

Growth uses ordinary Minecraft mechanics. Trial restoration returns to the
pristine saved terrain, so these saplings do not accumulate across resets.
This is a controller helper, not a newly trained neural skill.

Validation: all 359 JavaScript tests pass. The isolated native fixture
`node scripts/verify_reforest_native.cjs` verified an oak sapling, all four pale
oak saplings in a 2×2 group, and a mangrove propagule in actual survival mode.
Each used diagnostic inventory, restored the axe, and verified real server
blocks. No learning data was written and the verified-empty sky fixture was
cleaned. Evidence is in `logs/reforest-native.json`.

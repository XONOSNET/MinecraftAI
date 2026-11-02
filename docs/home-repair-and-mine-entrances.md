# Repair reach, door orientation and mine entrances

Home repairs check supporting-face reach from the bot's actual position. New
work positions leave half a block of reach allowance for walking arrival
tolerance. If clearing terrain removes a support or the server refuses every
reachable face, repair excludes that work cell and tries another verified
position. Failed placements do not count as progress or success; the existing
physical-progress deadline still applies.

Door placement waits two physics ticks after facing north, allowing Minecraft
to receive the rotation before the placement packet. Otherwise a locally
correct angle can still produce a sideways door that blocks the hut exit.

Staircase selection checks the excavation safety envelope at the entrance as
well as the first descending step. An unused entrance invalidated by nearby
falling blocks or water can be abandoned when the bot is still standing safely
on its original surface cell. Excavated shafts retain their checked retreat
requirements; actual flooded footing does not qualify for this fallback.

Recovery no longer ends an attempt because health or food is low. Hungry,
injured bots may seek food during a clear daytime opportunity; low health alone
does not send a hungry forager straight back to a house where regeneration is
impossible. Nighttime cover and visible-threat decisions still take priority,
and actual death remains a failed attempt.

Validation: 480 JavaScript tests, including off-center reach, refused repair
retries, rotation packet ordering and entrance hazards. An isolated native
survival fixture repaired five damaged house parts using real materials,
verified a north-facing door, and was cleaned afterward.

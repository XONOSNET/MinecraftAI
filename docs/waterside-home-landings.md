# Supported home landings beside water

BirchToad's north-facing door opened correctly, but its preferred exterior marker
was air above water. The adjacent supported bank passed plot-selection transit
checks while the more conservative dry work-footing check rejected it. The
home-approach fallback only checked the original marker, so the bot could not
leave its completed hut.

Home approaches now search the same neighboring offsets for supported banks
accepted by the existing water-transit validator. Open water is not a destination.
Construction return planning also uses checked mixed-terrain travel, while local
digging, floor replacement and placement stances retain dry work-footing rules.
Current, air, loaded-cell, hazard and verified-exit checks remain in force.

Validation: 485 JavaScript tests. A read-only inspection of the actual hut produced
a complete doorway route to the supported bank. The regression fixture checks
that bank selection fails when adjacent source water becomes a current. A separate
long-distance return check still found no complete route; this change does not
invent a connection across disconnected terrain.

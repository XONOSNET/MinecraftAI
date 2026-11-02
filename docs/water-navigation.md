# Water-aware world travel

Water is a travel medium with conditions and costs, rather than an unconditional
hazard. World navigation, scouting and tree approaches can use a verified
source-water crossing when their dry route fails. A complete dry route remains
preferred; mixed-route search charges more for wading and still more for swimming.
Dry banks beside source water are valid transit positions. House plots may have
a source-water exit instead of being rejected merely for proximity to a pond.

This initial controller handles shallow wading and open-surface swimming. It
requires loaded feet/head cells, air above each wet cell, calm source water, a
verified dry destination and at most 24 consecutive wet route cells. It rejects
flowing/falling water, bubble columns, waterlogged obstructions, nearby lava,
fire or magma, and enclosed underwater passages. Very low air prevents entering
a new wet cell from land. A swimmer may still surface and leave. It does not yet
plan arbitrary ocean voyages, diving, waterfall climbing or current-assisted
routes; those need separate resource/air and exit planning.

Physics-rate movement rechecks the short next segment and player clearance,
holds Jump to remain at the surface, and jumps onto a checked bank. Route
waypoints tolerate normal buoyancy at shore so the bot keeps moving onto land.
Wait/turn actions do not force forward movement; movement pauses remain bounded
and maintain the existing surface-swim fallback. Mining, excavation, building
work stances and floor foundations still use their dry-support checks.

Tests cover source-water crossings, dry-route preference, shallow versus deep
water, covered surfaces, currents, bubbles, lava, unloaded cells, air limits,
verified dry exits, changed obstacles and bank transitions. The isolated native
fixture uses actual survival movement and no supplied equipment; it is not a
policy learning score and does not grant production materials or success.


Validation: all 469 JavaScript checks passed. The native fixture actually entered
water, crossed its bounded channel and climbed onto the dry bank in 5.47 seconds
at full health. The fixture and its temporary operator status were cleaned.

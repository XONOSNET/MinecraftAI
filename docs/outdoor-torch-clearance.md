# Clearing an outdoor wall-torch mount

A completed natural-world policy run reached 6/8 successes. BirchBadger passed
its raised doorway but stopped at `light_place`: the outdoor torch cell was
obstructed. That cell sits just outside the normal house-clearing volume.

Outdoor torch placement now uses the existing construction-clearing behavior
before placing the torch. Its extra permission covers only the exact configured
outdoor torch cell, only during `light_place`, and only for the owning teacher's
plot. Normal construction clearing does not gain a larger excavation volume.

The existing checks still preserve construction and furniture, neighboring
plots, player footing, nearby players, and fluid/falling-block hazards. Digging
must be confirmed before placement, and the actual wall torch must verify.

Validation: all 378 JavaScript tests pass. The isolated native survival fixture
in `scripts/verify_torch_clearance_native.cjs` reproduces the previous refusal
with leaves in the mount, then clears one leaf block and installs a wall torch
in 0.6 seconds with the supporting wall intact and full health. The fixture
cleans itself and sends no learning reports or production resource grants.

The other stop in that policy run was AmberRobin during early gathering.
That navigation/collection stall remains separate; this fix does not claim to
resolve it. A completed comparison is still needed to assess learned-policy
improvement independently of controller corrections.

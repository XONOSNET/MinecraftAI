# Dry bank movement within mixed land/water routes

OakToad in baseline trial 730 already had a plot at [24695,67,16411]. After
collecting wood and sheltering, it was returning to clear that plot, not looking
for a new one. Telemetry showed over 3,100 blocks travelled and nearly 500 route
replans. Repeated positions lay on a dry north/south strip near X24592.

A read-only route replay against the real loaded terrain reproduced a complete
232-block water-capable return route. Its initial section was entirely dry bank,
including a one-block rise at Z16436. The whole route's water flag selected swim
controls even on these dry legs; the swim-up rule could request jump while still
at the rear of the departure block. It did not use an approached land takeoff.

Movement now selects swimming only when the body/current feet or next checked
cell is actually wet. Dry bank steps on mixed routes acquire the existing
checked-jump lease early, approach the departure edge, then jump with forward
held through landing. Successful and failed land jumps retain the existing
attempt feedback. Dry landing waypoints and smoothing no longer use the wider
vertical tolerance intended for buoyant swimmers. Water entry, real swimming,
air/current checks, private plots, collision checks and trial criteria remain.

Regression checks exercise approach without jumping, takeoff, uninterrupted
forward motion during flight, landing, switching to swimming, and retaining a
dry landing while falling. All 702 JavaScript tests pass. The native movement
fixture additionally tests a dry bank step from the rear of its departure cell
on a water-capable route, alongside the existing step/gap/overhead checks. This
fix targets a reproduced controller mismatch; it does not establish that every
long return detour or repeated route has the same cause.

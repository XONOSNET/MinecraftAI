# Stable tree-harvesting return points

The teacher's gathering report repeated an earlier failure: it remained less
than half a block from a fractional tree approach, with a complete route, while
the movement controller correctly refused the last unsupported step.

Tree selection had cached the exact current position whenever a log could be
harvested from existing footing. A bot can physically stand partly over a ledge,
but returning to that same fractional position later can fail full-body support
checks. Repeatedly requesting it eventually exhausted the progress timer.

The cached return point now uses the already-checked standing cell's center.
Harvesting still uses the bot's actual current footing and keeps reachable logs
locked. No drop, collision, player-clearance or terrain safety rule is relaxed.

The regression fixture reproduces the failure with a one-block terrace: the
old fractional endpoint fails the real proximity module's full-body support
check, while the new center is immediately recognized as a safe arrival after
the bot returns. Existing tree focus and navigation tests continue to pass.

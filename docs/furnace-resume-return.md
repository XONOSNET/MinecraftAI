# Return to the furnace after sheltering

In baseline trial 669, LabAI3 stopped at `smelt` when the furnace window
failed to open within twenty seconds. It had earned charcoal, interrupted
prebuild smelting to spend about ten minutes in a burrow, then resumed after
seeking cover away from its own plot. Its last navigation report was far from
its furnace. The early-lighting smelt handler attempted the native furnace
interaction immediately, without checking whether the bot had returned.

Smelting and cooking now yield to a shared return check before either native
furnace handler runs. A displaced bot follows the existing home navigation to
its own interior and retains the interrupted task. Work proceeds on a later
tick only when it is inside and within furnace interaction distance. Food,
danger, swimming recovery and committed movement retain their earlier dispatch
priority. The change does not retry failed windows indefinitely or award any
lesson progress for walking home.

Regression tests cover both smelting and cooking, displacement outside the
home, being near the furnace through an exterior wall, return and resumption,
preserved milestones and shelter priority. All 665 JavaScript tests passed.
Full survival comparisons are still required to measure the result.

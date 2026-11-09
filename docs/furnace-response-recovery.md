# Furnace response recovery

Trial 757 ended BirchToad's attempt at lesson 6 because a furnace inventory
acknowledgement did not arrive. This is now eligible for the same bounded
response recovery as crafting timeouts: pause for 500 ms and retry the current
step, with a fixed 30-second consecutive failure budget.

The furnace routine closes its previous window and reopens server-confirmed
slots before retrying. Existing output is collected before considering new
input or fuel. Recovery does not reset the trial, phase, lesson milestones or
progress timestamp. Missing ingredients, failed production and full inventory
remain distinct failures and are not reclassified as transport timeouts.

A regression drives the real smelt routine through a withheld initial
acknowledgement, window cleanup and a successful reopen with existing output.
It verifies exactly one output transfer, no additional ingredients, listener
cleanup, preserved task state and the fixed retry bound. This fixture does not
establish recovery from every possible interrupted furnace transfer; further
live comparisons are required to measure survival improvement.

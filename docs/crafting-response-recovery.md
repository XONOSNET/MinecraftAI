# Bounded crafting-response recovery

Baseline trial 727 stopped full-health bots with `Crafting table did not open`
and `Timed out synchronizing crafting inventory`. The native crafting routine
uses authoritative server responses, but its response timeouts were ordinary
Errors and bypassed the controller's existing bounded transport recovery.

Only those two exact response-timeout messages now enter the existing retry
path: pause movement, retain the phase and trial, wait 500 ms, retry the step,
and stop after thirty seconds of consecutive failures. Neither lesson progress
nor inventory is credited by retrying. The normal crafting routine still
synchronizes inventory and checks the actual server recipe result on each try.
Missing ingredients, inventory capacity, route failures and invalid recipe
results do not become retryable through this change.

A protocol fixture runs the real crafting routine against a simulated server
inventory: the first synchronization response is withheld, then the resumed
attempt consumes one log and receives four planks through authoritative window
responses. It checks unchanged phase, milestones and physical-progress time on
the failed attempt. Additional checks exercise retry exhaustion and errors that
must remain terminal. All 696 JavaScript tests pass. This does not establish that
every workstation timeout is transient; repeated failures remain bounded and
need investigation of range, workstation state or infrastructure.

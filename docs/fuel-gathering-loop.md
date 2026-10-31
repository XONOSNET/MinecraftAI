# First Night fuel gathering

Fuel expeditions require four raw logs. Carried planks count toward ordinary
house and settlement supplies, but cannot replace logs reserved for charcoal.

Previously, a bot with enough leftover planks could finish gathering immediately
during a fuel expedition, return through chest stocking and quarry setup, then
ask for fuel again. AmberRobin exhibited this repeated loop in First Night.

Gathering now keeps its fuel goal until four actual logs are carried, then
returns directly to stone-tool and furnace work without converting those logs
into planks. Elevated harvesting uses the same fuel goal so spare planks do not
prematurely end work on a temporary pillar. Reports show `Fuel logs x / 4`
while gathering fuel.

Validation: regression tests exercise repeated gathering ticks with 64 spare
planks and zero, one and three logs, the transition with four mixed-species logs,
continued elevated harvesting, and unchanged settlement supply accounting.
The full JavaScript suite passes (371 tests). No production resources are added.

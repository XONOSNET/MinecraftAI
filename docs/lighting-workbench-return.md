# Return to the workbench after interrupted lighting preparation

Teacher trial 683 stopped LabAI2 with `night_light_tools: Crafting table did
not open`. The last navigation report was a burrow exit near the house's front
approach. The early lighting handler immediately used its workbench recipe
without rechecking that it had returned within interaction range.

The existing furnace return guard now also covers `night_light_tools`, using
the workbench location. It preserves the interrupted phase and yields to the
normal home route until the bot is inside and within interaction range. Danger,
swimming and committed movement still run first. This does not reconstruct a
destroyed workbench or retry a refused crafting window indefinitely.

All 672 JavaScript tests passed. Regression coverage checks displacement,
return, work resumption and preserved milestones for the lighting-tool phase
as well as the existing furnace phases. Rollout is queued for the end of
comparison 312 so the running teacher/candidate measurements remain intact;
the committed source must not be treated as live until its rollout is verified.

# Detect entrance damage independently of the house shell

In baseline trial 680, LabAI0 stopped returning with wool at Y61, directly in
front of its Y64 house. It had no active home repair. The existing bounded
backfill planner covered the approach strip, but inspection included that plan
only after another structural defect had already marked the house unsafe or
started repair. An entrance crater alone could therefore go undetected while
the returning bot became stranded below the doorway.

Home inspection now includes the existing terrain plan independently. Missing
supported approach cells can start real backfill even if the walls, floor and
door remain intact. This uses the same narrow owned footprint, bottom-up
placement and carried-material budget; fluids, unloaded ground, deep voids,
intact floors and other homes retain their existing protections.

The regression leaves the entire house intact, removes two approach blocks,
verifies that inspection finds the damage, repairs both cells using two carried
dirt blocks and resumes the original lesson without consuming house planks or
awarding extra milestones. All 670 JavaScript tests passed. Full survival
comparisons are still needed to assess completion-rate effects.

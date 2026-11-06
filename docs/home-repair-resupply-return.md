# Return replacement supplies before planning house repairs

Student trial 677 stopped LabAI2 in home repair after collecting supplies:
26 parts remained and none had been repaired. Its last gathering position was
roughly forty blocks from the house. Repair stance selection uses a local
24-block route search, so it could not select a work position from there.
The controller kept reporting no safe stance instead of returning home.

After a successful wood resupply, repair now enters its return task before
requiring loaded house cells. While farther than twelve horizontal blocks or
three vertical blocks from the plot, it follows normal checked home navigation
to the exterior approach before local repair planning. It retains the original
repair and interrupted lesson. An explicitly blocked return remains a failure;
walking does not award repair progress or reset the physical progress deadline.
Existing terrain, ownership, liquid and placement guards remain in force.

The regression covers depletion, real replacement supplies, an unloaded distant
house, ongoing return travel, arrival, consuming planks to repair the actual
missing wall and resuming the original task without additional milestones.
All 666 JavaScript tests passed. This addresses distant resupply handoff;
separate failures to find a safe nearby work stance remain under investigation.

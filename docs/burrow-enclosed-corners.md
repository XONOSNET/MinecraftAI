# Check the refuge enclosure before inaccessible diagonal voids

Trial 715 OpalWren and trial 717 OpalWren stopped with `No visible supporting
face for repair` at diagonal shell cells. A read-only native inspection of trial
717 found air at [24628,64,16496], while both inward cells [24628,64,16497] and
[24627,64,16496] were intact full dirt blocks. The air pocket was separated from
the shaft by those walls; patching it would require reaching through the walls.

For previously verified refuges only, runtime validation accepts an air-only
diagonal corner when both inward cells remain full, dry solid blocks. Initial
site selection still requires the complete original shell. Validation checks the
center and cardinal walls before corners, so any actual opening becomes the
repair target first. Water, lava, falling material, unloaded cells, waterlogged
walls, center-floor damage and roof breaches retain their existing checks.

The native read-only check reproduced the old corner failure and confirmed that
the revised check accepts this enclosed geometry. Regression fixtures exercise
continued sheltering and full daylight exit/resume, plus cardinal wall damage,
missing floor, corner hazards and unloaded cells. The complete JavaScript suite
passes 691 tests. Real survival outcome improvements still require evaluation on
the deployed controller; these checks do not establish a higher completion rate.

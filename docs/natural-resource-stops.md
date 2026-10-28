# Natural resource stage: stopped bots

At investigation, LabAI4 and LabAI5 had stopped in gathering with "fetch failed" while health and food were full. Those were local transport failures, not failed navigation decisions. Other bots were still working. The survey fix had succeeded: all eight had entered gathering on the level 1 shore site.

A concurrent service probe was responsive (median stale-step request 8.7 ms), while bot-reported policy round trips were sometimes over a second. Native controller profiling found a single synchronous 64-block tree search taking 793.3 ms. Eight bots repeated this work on one Node event loop, blocking movement and networking callbacks.

The new acquisition helper examines only loaded chunk sections at the relevant tree heights, uses block-state palettes to skip irrelevant sections, and yields between columns. The native check completed in 29.3 ms. It retains the physical search radius and height range; the existing boundary, hazard, visibility and harvesting-reach checks still filter candidates. It does not acquire terrain beyond loaded chunks. Empty acquisition results also respect the normal scan interval rather than triggering another full search on every decision.

Brief local connection failures now retain the current phase, stop movement and retry after 500 ms. A continuous 30-second failure is reported as infrastructure trouble. An infrastructure-failed comparison restores unvalidated weights and retries the same site without scoring models; three consecutive such comparisons stop explicitly rather than looping forever. World-mutating requests are not blindly replayed by the transport helper.

Harvesting also waited ten 100-ms settling polls when a grounded Mineflayer entity reported its ordinary -0.0784 vertical gravity velocity. It now waits only while actually airborne; native block removal acknowledgments remain required.

Validation: 219 JavaScript tests and 248 Python tests passed. Native profiling details are in natural-tree-scan-native.json. The profile is a short single-client mechanics measurement, not an eight-bot completion qualification. Automatic learning restarts at level 1, same site, with a fresh comparison under the updated controller.

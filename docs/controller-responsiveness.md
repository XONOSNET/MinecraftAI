# Controller responsiveness

The dashboard was sending approximately 5.35 MB every poll, mostly private world landmark copies and memories embedded in historical trials. FastAPI's recursive response conversion took approximately two seconds in a local profile (6.2 million function calls). Live navigation reports recorded policy round trips of 1.8–3 seconds. This made bots wait between construction actions and allowed short motor commands to expire.

The status endpoint now builds detached dashboard views without internal landmark copies, quarry block lists or private behavior snapshots. It serializes a JSONResponse while holding the state lock, avoiding both recursive FastAPI conversion and concurrent dictionary mutation after lock release. Full trial state and memories remain stored for learning. Visible histories, lesson progress, timing and model information are preserved. The response is about 1.17 MB; remaining episode history is unchanged.

Construction reuses confirmed held materials and does not synchronize inventory twice before the same placement. Actual inventory checks, equipment swaps, placement acknowledgments and refusal handling remain. Busy bots permit only one pending heartbeat, preventing a backlog during a service delay.

All 206 JavaScript tests and 238 Python tests passed. The API probe measured median stale-step response time falling from 831.75 ms to 13.7 ms, with maximum falling from 4760.1 ms to 70 ms. Dashboard polls fell from roughly 3–4.2 seconds to 53–93 ms. Exact measurements and differing simulation phases are in dashboard-latency-check.json. This is a short responsiveness check, not a sustained-load or full curriculum qualification.

Protected weights were restored before deployment; automatic eight-bot First Night learning restarts with a fresh baseline under the new controller on both sides of the comparison.

Live construction verification placed eight real wall blocks in 2.913 seconds, verifying each server acknowledgment. Individual placements took 111–1079 ms; slower placements include aiming/equipment work rather than an artificial delay. Fixture grants and timings are in first-night-building-native.json. This does not claim every construction phase or terrain route is solved.

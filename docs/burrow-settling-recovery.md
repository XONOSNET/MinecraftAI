# Wait for checked dry footing before rejecting burrow repair

Teacher trial 735 AmberRobin failed during excavation after a changed shell
cell was detected. Its terminal snapshot recorded Y63.890875, downward velocity,
`on_ground: false`, dry dirt footing at Y62, centered position in the verified
shaft, and 31 real earth blocks. The repair guard immediately rejected this
ordinary descent because placement requires grounded footing.

A repair now holds controls for at most two seconds when the bot is airborne,
centered inside its previously verified shaft, and a short loaded dry descent
ends on solid footing within the original two-block refuge depth. The repair
target, neighboring hazards, private plots and player clearance are checked
before waiting. Body/head clearance and the entire short downward column must
remain open and dry. Fluid, unloaded or unsupported descents, off-center bodies,
and falls below the planned shaft remain rejected.

Waiting grants no material, milestone or physical progress and does not reset
any existing repair deadline. After touchdown all normal placement checks run
again. Regression transitions cover waiting, real carried dirt placement after
landing, and resuming excavation; negatives cover the two-second bound, missing
footing, fluids and deeper falls. All 704 JavaScript tests pass. This addresses
a specific premature failure, not every damaged-refuge recovery case.

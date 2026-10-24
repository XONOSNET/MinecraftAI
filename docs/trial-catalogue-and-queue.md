# Trial catalogue and queued batches

The dashboard lists all courses with search by number/name/feature and a skill filter. Descriptions, layout settings, objectives, promotion gates and stable IDs come from the executable stage definitions. This iteration is read-only.

Queue a neural policy test or a teacher demonstration. Each batch uses three trials per bot (currently 24 total). FIFO batches run between completed learning cycles, preserving and restoring the curriculum stage and confirmation streak. Tests do not update weights or promotion progress. Teacher batches collect examples for later training, without forcing a training job.

Pending batches can be reordered, removed or cleared. Clearing pending work leaves the active batch intact. Pausing or restarting preserves active work; it restarts on fresh routes after resuming. Resource holds use existing health recovery. Incomplete batches time out after ten minutes and return to the curriculum. Queue state and the last 50 results persist in data/curriculum.json; 20 results appear in status. The pending queue limit is 50.

Module boundaries:

- lab/trial_catalogue.py: human-readable catalogue metadata.
- lab/trial_queue.py: queue mutations, scheduling and progress restoration.
- lab/curriculum.py: automatic learning and promotion, with a queue boundary hook.
- GET /trials: descriptions; authenticated POST /trials/queue and /trials/queue/{remove,reorder,clear}: queue changes.

The code has central stage definitions and shared task contracts, but geometry, motor actions and UI have accumulated across modules. A full rewrite is unnecessary. A future editor should use validated, versioned JSON recipes and trusted arena builders, preview recipe copies before saving, and record recipe IDs and revisions in trial history. Editing a definition must not change a running arena. New mechanics still need explicit observations, actions and teacher behavior; editing parameters alone cannot create a new learned capability.

Verification covers descriptions, ordering, safe insertion, stage/streak restoration, teacher semantics, restart persistence, resource recovery and timeouts. Native queue verification is recorded separately.

Native proof: a 24-task Short routes neural test and a 24-task Equip a wooden sword teacher demonstration both completed 24/24, then restored stage 140 and its existing confirmation streak of one. See trial-queue-native.json. Browser verification covered catalogue loading, filtering to a door course, its detailed objective, enqueue and remove.

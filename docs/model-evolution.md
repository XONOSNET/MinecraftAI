# Model evolution tracking

The dashboard shows the currently selected skill policy and a table of all tracked skill policies. Bots share these policies; bot names and model identities are independent.

Each distinct skill/weight fingerprint receives a persistent MODEL-000001-style ID and a per-skill revision. A deterministic two-word name is derived from its SHA-256 fingerprint. This is generated naming, not a language model choosing its own name. Fingerprints cover tensor names, types, shapes and values. Saves, backups, review rounds and restoring known weights do not create a new identity. A rollback reactivates the earlier identity; the next candidate derives from that restored parent.

The registry lives in policy_versions, policy_current and policy_pending tables in data/lab.sqlite. It starts by registering the existing checkpoints; past evolutions cannot be reconstructed reliably from legacy training event paths. Names, version numbers and history survive restarts. No old checkpoints or model weights are modified by importing them.

Candidates are labeled separately from accepted and rejected training updates. The existing curriculum callback records baseline and candidate success rates and task count. Accepted follows the current non-regression gate (candidate success rate at least baseline), not a claim of universal improvement or stage completion. Manual training remains unvalidated until measured. Existing baselines do not retroactively claim a training score. Interrupted candidates can remain labeled candidate until a completed candidate evaluation; their active flag independently shows which weights are loaded.

Raw weight bytes are the sum of tensor storage sizes. Checkpoint bytes are the actual serialized file size, including optimizer state when present. Neither is process RAM usage. Parameter count, layer widths, training example count, duration and final loss are shown where available. The history displays the newest 60 identities; older records remain in SQLite. Identity history does not guarantee an archived weight file: existing checkpoint retention is unchanged.

Validation: pytest tests/test_evolution.py tests/test_curriculum.py tests/test_model.py tests/test_skills.py; node --test tests/dashboard-status.test.js.

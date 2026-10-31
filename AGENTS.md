# Project collaboration and GitHub publication

The user authorized publishing this project to
`https://github.com/XONOSNET/MinecraftAI.git` and routinely committing/pushing
implemented updates to that repository going forward.

- After completing a requested change, run checks appropriate to its scope,
  commit the relevant source, tests and documentation, then push the commit to
  this repository's configured upstream. The current branch is `master`.
- Preserve unrelated working changes. Stage explicit paths, rather than blindly
  staging the entire checkout. Do not publish unfinished changes as completed.
- Never commit credentials, API tokens, environment secrets, private keys,
  running Minecraft worlds, training databases, model checkpoints, logs,
  backups, downloaded runtimes, virtual environments or installed dependencies.
  These remain local unless the user explicitly requests a suitable separate
  distribution. Keep `.gitignore` protections in place.
- Do not force-push, rewrite published history, overwrite remote changes or
  change repository visibility. If the remote advances, fetch and inspect it
  before integrating changes. Report authentication or push failures honestly.
- Git publication must not stop Minecraft or learning. Restart lab components
  only when implementing changes actually requires it. Preserve training data,
  bot identities, protected models, current settings and intentional user pauses.
- For controller changes, compare baseline and candidate using the same
  controller version: restore any unvalidated model bundle and start a fresh
  comparison when deploying. Prefer `scripts/Restart-Bots.ps1` for JS-only
  changes, keeping Minecraft and the dashboard running.

JavaScript checks: `node --test tests/*.test.js`.
Python checks: `.venv/Scripts/python.exe -m pytest -q`.

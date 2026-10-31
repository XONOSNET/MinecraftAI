# GitHub source repository

Repository: https://github.com/XONOSNET/MinecraftAI

This checkout publishes source code, tests, documentation, configuration and
project assets. Minecraft worlds, downloaded server/plugins, learned model
checkpoints, training data, logs, credentials and dependencies remain local.
A GitHub checkout alone does not include the trained bots' current weights or
the live world; follow the setup instructions to create a fresh lab.

The configured branch is `master`, tracking `origin/master`. Git Credential
Manager handles browser authentication and stores credentials through Windows.
Never paste a token into project files or commit one to Git.

The user authorized the coding agent to commit and push future implemented
updates after appropriate verification. This instruction is retained in the
root `AGENTS.md`. It is a completion workflow, not a background file watcher:
unfinished edits are not automatically uploaded on every save.

To publish a manually prepared commit from PowerShell:

```powershell
git status
git add path/to/changed-file
git commit -m "Describe the completed change"
git push
```

Git operations do not require stopping the lab. Inspect remote changes before
integrating them; avoid a pull or reset over unrelated local work.

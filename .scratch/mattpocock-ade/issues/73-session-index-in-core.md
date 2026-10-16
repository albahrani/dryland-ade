# Session index in core

Type: task
Status: ready-for-agent

Spec: [spec](../spec.md), user stories 101, 102. "Sessions, pausing and resuming". ADR 0010. Session ids per CLI: `research/agent-cli-session-resume.md`.

## What to build

The session index that links items to their Agent CLI sessions, and its first writer, the `dryland ticket` commands.

- **Where**: `<git common dir>/dryland/sessions.json`, found through `git rev-parse --git-common-dir` on the `ProcessRunner` seam, so the main checkout and every worktree share one file. Git never sees it.
- **Shape**: keyed by item (a ticket `<map>/<NN>`, a map, or a scratch worktree branch). Per item, its known sessions, newest first: the adapter id, the CLI's own session id, last seen, and an optional last state (`running`, `waiting`, `idle`) that only the app writes.
- **Writes** are atomic (temp file and rename) under a lock file beside the tracker lock, reusing the tracker lock's stale-holder recovery. Recording a known session id moves it to the front and updates last seen; it never duplicates.
- **Retention**: every write drops sessions last seen longer ago than the retention period (a parameter, default 30 days; the setting comes with the Settings dialog) and items left empty.
- **Robust reads**: a missing or unparseable file reads as empty with a warning and is replaced by the next write.
- **Writer**: every mutating `dryland ticket` command (claim, release, resolve, block, comment, triage) run with an adapter's session variable set records that session against the ticket. The variable is a new adapter field, `CLAUDE_CODE_SESSION_ID` for Claude Code. Without it nothing is recorded. `dryland status` is unchanged.
- **Read surface**: `dryland ticket show [--json]` lists the ticket's known sessions.

## Acceptance criteria

- [ ] The index path is the same from the main checkout and from a linked worktree, and `git status` stays clean after a write
- [ ] `dryland ticket claim` with `CLAUDE_CODE_SESSION_ID` set records that session on the ticket, and `dryland ticket show` lists it
- [ ] Without the variable, no entry is written
- [ ] Recording the same session id twice updates last seen without a duplicate
- [ ] Parallel `dryland` processes recording different sessions lose no entry
- [ ] Sessions older than the retention period are dropped on the next write
- [ ] A missing or unparseable index reads as empty and never throws; the next write replaces it

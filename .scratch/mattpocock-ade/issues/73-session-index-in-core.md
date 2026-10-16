# Session index in core

Type: task
Status: resolved

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

- [x] The index path is the same from the main checkout and from a linked worktree, and `git status` stays clean after a write
- [x] `dryland ticket claim` with `CLAUDE_CODE_SESSION_ID` set records that session on the ticket, and `dryland ticket show` lists it
- [x] Without the variable, no entry is written
- [x] Recording the same session id twice updates last seen without a duplicate
- [x] Parallel `dryland` processes recording different sessions lose no entry
- [x] Sessions older than the retention period are dropped on the next write
- [x] A missing or unparseable index reads as empty and never throws; the next write replaces it

## Comments

From mattpocock-ade/41 (bc47448): quit and shutdown run shutdownSteps(terminals, flushes) from packages/desktop/src/main/lifecycle.ts under one 2-second budget; PTYs are killed first, then each flush step in order, and a step still running at the deadline is abandoned. Index writes that complete as they happen need no step. Any index write the app holds back (such as a last state written by the app) must be added there as a flush step, and stay a local file operation.

## Answer

Built in 9068120. Core module session-index.ts: sessionIndexPath (git rev-parse --git-common-dir on the ProcessRunner seam), readSessionIndex, the pure withSession and parseSessionIndex, recordSession (sessions.lock beside tracker.lock, reusing the tracker's acquireLock, writeAtomically and leftover-temp cleanup, now exported from tracker-write.ts) and currentAgentSession. Entries are {adapter, sessionId, lastSeen, lastState?}, keyed by item, newest first, deduplicated on adapter plus session id; a re-recorded session keeps its lastState. Retention is a parameter (DEFAULT_SESSION_RETENTION_DAYS = 30) applied on every write, also dropping empty items. AgentAdapter gained sessionEnv (CLAUDE_CODE_SESSION_ID for Claude Code, null allowed). The CLI records on claim, release, resolve, block, comment and triage (not create) after the command succeeds; a failed index write is a warning, never a failed command. ticket show adds sessions to --json and a Sessions section to text. Decisions: a missing index reads as empty silently, only an unparseable or unreadable one warns, so every ticket show before the first session stays quiet; malformed entries inside a valid index are dropped individually. The CLI test harness strips adapter session variables unless a test sets them, since the suite may itself run inside a Claude Code session. Known limits: the app does not write lastState yet, and the retention setting is not wired to Settings (ticket 55).

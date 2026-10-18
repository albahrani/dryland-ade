# Reconcile the session index

Type: task
Status: resolved
Blocked by: 73

Spec: [spec](../spec.md), user stories 101, 102. "Sessions, pausing and resuming". ADR 0010. History layout and path slugs: `research/agent-cli-session-resume.md`.

## What to build

The index is a cache; on app startup and window focus the app brings it in line with the tracker, git and Claude Code's own history.

- **Found sessions**: for each claimed ticket with a worktree, and each scratch worktree, list Claude Code's history directory for that path (`~/.claude/projects/<path slug>/`). Each `<id>.jsonl` not in the index is added as found: id from the file name, last seen from its modification time, no last state. Transcript contents are never parsed (the format is unofficial).
- **Dropping**: items whose ticket is resolved or whose claim was released are removed. A Claude Code session whose history file is gone (Claude deletes after 30 days) is removed. Retention applies as on every write.
- Copilot CLI is not reconciled: its history is not per directory (its sessions come from hooks and `dryland` commands).
- Runs off the renderer, and writes nothing when nothing changed.

## Acceptance criteria

- [x] A Claude Code session started by hand in a ticket's worktree appears on that ticket after window focus
- [x] Entries of a resolved ticket, and of a released claim, are removed
- [x] A Claude Code entry whose history file is gone is removed
- [x] A reconcile that changes nothing does not write the index
- [x] The path slug function is tested with Windows and POSIX paths against real examples recorded in the research

## Comments

From mattpocock-ade/73 (9068120): the index lives in packages/core/src/session-index.ts with readSessionIndex, the pure withSession and parseSessionIndex, and recordSession (sessions.lock beside tracker.lock, atomic write, retention via DEFAULT_SESSION_RETENTION_DAYS on every write). It has no remove operation and no found marker yet: add both there, under the same lock, as pure functions next to withSession, rather than writing the file another way. IndexedSession is {adapter, sessionId, lastSeen, lastState?}; a found session has no lastState per ADR 0010, so it needs its own flag to tell it apart from one recorded by a dryland command. parseSessionIndex drops malformed entries individually, so a new optional field must be accepted there too. Decisions carried over: a missing index reads as empty silently, only an unparseable one warns.

## Answer

Built in 4b021bc and c3d2d3e. packages/core session-reconcile.ts reconciles the index on app start and window focus (main process, refresh only when changed); session-index.ts gained the found flag, reconcileIndex, updateSessionIndex (no write when unchanged, recordSession now uses it), claudeProjectSlug and claudeHistoryDir. Decisions: scratch worktrees key to the map name when the map exists, else the branch; a 10-minute grace keeps a just-recorded session whose history file is not yet written; slugs over 200 chars (undocumented hash) are skipped; an unlistable history leaves its item untouched. Limits: the research records only Windows slug examples (the POSIX test cases are written from the documented rule); sessions moved with /cd are dropped once their file is gone from the worktree's folder; a focus-triggered reconcile is debounced to once per 3 seconds. Follow-up commit: an Electron test (e2e/reconcile.spec.ts) covers focus to paused count; the research now records the Windows slug example and a POSIX one derived from the rule, to be replaced by an observed one.

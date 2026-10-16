# Reconcile the session index

Type: task
Status: ready-for-agent
Blocked by: 73

Spec: [spec](../spec.md), user stories 101, 102. "Sessions, pausing and resuming". ADR 0010. History layout and path slugs: `research/agent-cli-session-resume.md`.

## What to build

The index is a cache; on app startup and window focus the app brings it in line with the tracker, git and Claude Code's own history.

- **Found sessions**: for each claimed ticket with a worktree, and each scratch worktree, list Claude Code's history directory for that path (`~/.claude/projects/<path slug>/`). Each `<id>.jsonl` not in the index is added as found: id from the file name, last seen from its modification time, no last state. Transcript contents are never parsed (the format is unofficial).
- **Dropping**: items whose ticket is resolved or whose claim was released are removed. A Claude Code session whose history file is gone (Claude deletes after 30 days) is removed. Retention applies as on every write.
- Copilot CLI is not reconciled: its history is not per directory (its sessions come from hooks and `dryland` commands).
- Runs off the renderer, and writes nothing when nothing changed.

## Acceptance criteria

- [ ] A Claude Code session started by hand in a ticket's worktree appears on that ticket after window focus
- [ ] Entries of a resolved ticket, and of a released claim, are removed
- [ ] A Claude Code entry whose history file is gone is removed
- [ ] A reconcile that changes nothing does not write the index
- [ ] The path slug function is tested with Windows and POSIX paths against real examples recorded in the research

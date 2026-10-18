# Resume a paused session

Type: task
Status: resolved
Blocked by: 65, 75

Spec: [spec](../spec.md), user stories 98, 99. "Sessions, pausing and resuming" (the paused-session bullet). ADR 0010. Layout detail: `prototype/views-and-ux/index.html?variant=B` (open a ticket with a paused session). `research/agent-cli-session-resume.md`.

## What to build

A ticket whose session is paused offers to continue that same Agent CLI session.

- **Paused box**: in place of the terminal or the start box, a ticket tab with a paused session shows its label ("was waiting on you", "interrupted", "Paused"), the agent, the CLI session id, last seen and the branch. It shows the session's last output line when Dryland still holds it (it paused during this run), how to continue, and the resume command. Buttons: Resume, Pick another session, Start fresh. The same applies to a map tab once map sessions exist.
- **Badges**: a paused session shows a pause badge on its agent icon in Tickets tree rows and tabs: gold when it was waiting, red when interrupted. The ticket header carries a pill with the label.
- **Resume**: first a session-exists check per adapter (a new adapter field; Claude Code: its history file for that id in the worktree's history directory exists). Then the CLI is launched with its resume-by-id arguments in the item's worktree, hooks injected, nothing pre-typed. The index entry becomes live again; the claim is untouched.
- **Fallbacks**: an id the CLI no longer has opens the CLI's own picker in the item's worktree, with a message saying why. Pick another session opens the picker directly. Start fresh starts work as today (new id, command pre-typed) and keeps the old entry.

## Acceptance criteria

- [x] A ticket with a paused session shows the paused box with its label and Resume
- [x] Resume launches the CLI with resume-by-id in the ticket's worktree with hooks injected; the session is live and the claim unchanged
- [x] With the session's history missing (fake home directory in the test), Resume opens the picker and says why
- [x] Start fresh opens a new session with the command pre-typed; the older session stays in the index
- [x] Tickets tree rows and tabs show the pause badge in the colour of the label
- [x] The last output line shows for a session paused during this run and is left out after a restart
- [x] A Playwright test stops a session and resumes it with the fake-CLI stub

## Comments

From mattpocock-ade/74 (e273a26): resumeArgs(adapter, id | null) in core gives the resume arguments ([--resume, id], or [--resume] for the picker; null when the CLI cannot resume), and sessionIdArgs the launch ones. SessionInfo.agentSessionId is the id given at launch; after /clear the newest id lives only in the index (sessionsOf(index, item)[0]), so resume should read the index, not SessionInfo. sessionItem(session) in desktop/src/main/session-recording.ts maps a session to its index item.

## Answer

Built in 93cde7b. core: AgentAdapter.historyFile (Claude Code: ~/.claude/projects/<cwd, non-alphanumerics as -> /<id>.jsonl) and sessionExists(). desktop main: WorkStarter.resumeSession(project, ticket, 'resume'|'pick') reads the newest indexed session, checks it exists, launches the CLI with resume-by-id (or the picker, with a warning saying why when the history is gone) in the ticket's worktree with hooks injected, nothing pre-typed, no claim call, and re-records the entry; IPC work:resume. Renderer: PausedBox (label, agent, CLI session id, last seen, branch, last output line, resume command; Resume / Pick another session / Start fresh) replaces the start box; PausedBadge (gold waiting, red interrupted, plain otherwise) on Tickets rows and ticket tabs; header pill. TreeLoad.pausedClaims now carries PausedSession records. Start fresh is startWork with no skill chosen, so the old entry stays. Known limits: tickets only (map tabs wait for map sessions); Start fresh offers no skill chooser; the last output line skips Dryland's own '[session stopped]' notice; an index entry whose adapter is unknown gives Start fresh an empty agent id. The existing hooks e2e now starts its second session through Start fresh, since an ended session leaves a paused claim.

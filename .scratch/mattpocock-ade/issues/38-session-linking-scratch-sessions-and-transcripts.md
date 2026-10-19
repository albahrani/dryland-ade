# Session linking, scratch sessions and transcripts

Type: task
Status: resolved
Blocked by: 37

Spec: [spec](../spec.md), user stories 48 to 50. "Worktrees and linking". ADR 0006.

## What to build

Three behaviours that make sure no session is lost:

- **Manual sessions link by working directory.** A session the user starts by hand inside a Dryland-created worktree (for example by running the Agent CLI in a plain terminal tab) links to that worktree's ticket.
- **Ticketless sessions get a scratch worktree.** Starting an Agent CLI without a ticket creates a `<effort>/scratch-<slug>` worktree and runs there, so exploratory work is isolated too.
- **Ended sessions stay readable.** When a session ends, its tab keeps the terminal content as a read-only transcript until the tab is closed.

## Acceptance criteria

- [x] An Agent CLI started by hand in a terminal tab inside a ticket's worktree appears under that ticket in the Sessions view
- [x] A session started in a directory Dryland did not create appears under Unlinked
- [x] Starting a session without a ticket creates a scratch worktree and opens the CLI there
- [x] After a session ends, its tab shows the full output, accepts no input and is marked ended
- [x] Closing the tab of an ended session removes it from the Sessions view; once the paused-session tickets land, a session whose item is still claimed moves to the Paused pane instead
- [x] Dryland persists no transcript of an ended session across an app restart (the Agent CLI keeps its own; paused sessions and the session index are ADR 0010's later tickets)

## Comments

From mattpocock-ade/40 (a6c8530): part of the scratch-worktree plumbing exists. Core has worktreeForScratch(runner, cwd, map, slug), which reuses <map>/scratch-<slug> when it is on disk. The desktop WorkStarter takes a WorkTarget (ticket | map | new-map, in shared/work-target.ts), and SessionInfo.ticket is nullable with a map field. A ticketless session can be one more WorkTarget kind instead of a new code path.

## Answer

Built in 19811b2. Scratch: File > New Scratch Session... opens the Agent CLI in a fresh scratch/scratch-session worktree (collision-suffixed) with nothing typed (new WorkTarget kind 'scratch'). Ended sessions: the terminal view turns read-only (disableStdin) and keeps its output; closing the tab drops the session from the Sessions view; nothing is persisted. Manual sessions: plain terminal tabs put shims for claude on PATH; the shim calls the hidden 'dryland agent-prepare <adapter>' for the real binary, a fresh session id and the hook flag, then runs the CLI itself (running it through the Electron runtime lost the TTY on Windows). Status events from such a CLI carry agent, cwd and pane; the app adopts the session, linked via core worktreeAt to its ticket, or Unlinked; closing its tab ends the shell. Launch helpers moved to core agent-launch.ts. Known limits: only adapters with empty launchArgs get a shim; a CLI that reports nothing (Copilot before its first prompt) is not seen; review noted glossary entries for scratch/hand-started sessions and a repeated scratch/manual/new-map ternary (sessionKind) as follow-ups. Tests: pnpm test, test:linux, e2e native and Linux pass.

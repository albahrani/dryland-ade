# Session linking, scratch sessions and transcripts

Type: task
Status: ready-for-agent
Blocked by: 37

Spec: [spec](../spec.md), user stories 48 to 50. "Worktrees and linking". ADR 0006.

## What to build

Three behaviours that make sure no session is lost:

- **Manual sessions link by working directory.** A session the user starts by hand inside a Dryland-created worktree (for example by running the Agent CLI in a plain terminal tab) links to that worktree's ticket.
- **Ticketless sessions get a scratch worktree.** Starting an Agent CLI without a ticket creates a `<effort>/scratch-<slug>` worktree and runs there, so exploratory work is isolated too.
- **Ended sessions stay readable.** When a session ends, its tab keeps the terminal content as a read-only transcript until the tab is closed.

## Acceptance criteria

- [ ] An Agent CLI started by hand in a terminal tab inside a ticket's worktree appears under that ticket in the Sessions view
- [ ] A session started in a directory Dryland did not create appears under Unlinked
- [ ] Starting a session without a ticket creates a scratch worktree and opens the CLI there
- [ ] After a session ends, its tab shows the full output, accepts no input and is marked ended
- [ ] Closing the tab of an ended session removes it from the Sessions view
- [ ] Nothing about ended sessions is persisted across an app restart

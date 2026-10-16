# Quit and shutdown lifecycle

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-16T12:42:18.967Z","was":"ready-for-agent"}} -->
Blocked by: 39

Spec: [spec](../spec.md), user stories 55, 56. "Lifecycle, packaging and release". ADRs 0002, 0004, 0010.

## What to build

Quitting leaves a consistent state and keeps the user's work resumable. Quitting with live sessions shows a confirmation listing every one of them, including sessions not shown in a tab, then stops them. Once "Hidden session tabs and Stop session" has landed, sessions waiting on the user or with unseen output are listed first. Nothing is released: claims stay, and the sessions become paused (ADR 0010), resumed through the Agent CLI on a later start.

Quit and system shutdown share a hard 2-second budget, in this order: kill PTYs, flush the session index (once it exists) and UI state. No tracker write and no network call is made at quit or shutdown.

Rewritten after the paused-sessions grilling: this ticket no longer releases Dryland's own claims at quit.

## Acceptance criteria

- [ ] Quitting with live sessions shows a confirmation that lists them all; cancelling keeps everything running
- [ ] Quitting with no live sessions asks nothing
- [ ] After quit, no PTY child process is left
- [ ] Quit and shutdown make no tracker write and no network call; every claim is as it was before quitting
- [ ] The lifecycle module is tested with a fake PTY provider and a slow flush: the order holds and the whole sequence finishes within 2 seconds, abandoning what does not fit
- [ ] UI state (open tabs, settings) survives the restart

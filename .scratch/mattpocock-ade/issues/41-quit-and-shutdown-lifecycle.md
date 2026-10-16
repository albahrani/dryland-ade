# Quit and shutdown lifecycle

Type: task
Status: resolved
Blocked by: 39

Spec: [spec](../spec.md), user stories 55, 56. "Lifecycle, packaging and release". ADRs 0002, 0004, 0010.

## What to build

Quitting leaves a consistent state and keeps the user's work resumable. Quitting with live sessions shows a confirmation listing every one of them, including sessions not shown in a tab, then stops them. Once "Hidden session tabs and Stop session" has landed, sessions waiting on the user or with unseen output are listed first. Nothing is released: claims stay, and the sessions become paused (ADR 0010), resumed through the Agent CLI on a later start.

Quit and system shutdown share a hard 2-second budget, in this order: kill PTYs, flush the session index (once it exists) and UI state. No tracker write and no network call is made at quit or shutdown.

Rewritten after the paused-sessions grilling: this ticket no longer releases Dryland's own claims at quit.

## Acceptance criteria

- [x] Quitting with live sessions shows a confirmation that lists them all; cancelling keeps everything running
- [x] Quitting with no live sessions asks nothing
- [x] After quit, no PTY child process is left
- [x] Quit and shutdown make no tracker write and no network call; every claim is as it was before quitting
- [x] The lifecycle module is tested with a fake PTY provider and a slow flush: the order holds and the whole sequence finishes within 2 seconds, abandoning what does not fit
- [x] UI state (open tabs, settings) survives the restart

## Answer

Built in bc47448. A lifecycle module (packages/desktop/src/main/lifecycle.ts) runs the shutdown steps in order under one shared 2-second budget: kill PTYs first (before the first await, so a Windows session-end that kills the process right after still leaves none), then flush steps; a step still running at the deadline is abandoned with every step after it, a failing one is reported and the next runs. quitConfirmation lists every session whose CLI still runs, tab or not, waiting ones first, and asks nothing when none runs. Quit, the window's close button, the menu and a system shutdown (powerMonitor 'shutdown' on macOS/Linux, the window's 'session-end' on Windows, no question asked) all go through it; nothing is released and no tracker is written. Decisions: a native message box (works after the window is gone; e2e tests stub dialog.showMessageBox); a session whose CLI reported SessionEnd counts as not running even while its PTY winds down (on Windows it lingers), though its PTY is still killed. Known limits: UI state is written atomically as it changes, so it has no flush step; the session index step joins shutdownSteps once 'Session index in core' gives the app something to flush; 'unseen output first' waits for 'Hidden session tabs and Stop session'; the two system-shutdown paths are wired but not covered by a test. Tests: unit (fake PTY provider, slow flush, fake timers) and two e2e tests (Cancel keeps the session, Quit kills the CLI and leaves the claim and history unchanged; no question when only ended sessions remain), green with pnpm test, test:linux, test:e2e and test:e2e:linux.

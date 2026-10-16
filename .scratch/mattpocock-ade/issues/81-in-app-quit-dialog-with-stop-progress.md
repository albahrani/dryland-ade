# In-app quit dialog with stop progress

Type: task

Spec: [spec](../spec.md), user stories 55, 56. "Lifecycle, packaging and release". ADRs 0002, 0004, 0010. Follows mattpocock-ade/41 (bc47448).

## What to build

A quit the user starts and a quit the OS forces are different situations, and they get different treatment. mattpocock-ade/41 gave both one hard 2-second budget and a native message box. That was stricter than the user's own quit needs.

- **User quit** (menu, window close button, Cmd/Ctrl+Q): the question is an in-app dialog, like the app's other confirmations. It shows what is about to be stopped: each running session with its agent, its item, its worktree branch and its state badge, waiting ones first. Once confirmed, it shows the shutdown steps' progress (stopping sessions, flushing the session index and UI state) and closes when they are done. This path has no hard 2-second budget. A "Quit now" action stays available throughout. It abandons the remaining steps and quits at once; atomic writes leave nothing half-written.
- **OS-forced quit** (system shutdown, restart, log-off: the window's `session-end` on Windows, `powerMonitor` `shutdown` on macOS/Linux): unchanged from mattpocock-ade/41. No question, kill PTYs first, the hard 2-second budget, abandon what does not fit.
- **Fallback**: if the window does not answer the quit request within about 2 seconds (hung, crashed, reloading, or gone), the main process falls back to today's native message box, so quitting never depends on a healthy renderer.
- Nothing is released and no tracker is written on either path (ADR 0010).
- `runShutdown` / `shutdownSteps` in `packages/desktop/src/main/lifecycle.ts` stay the one ordered sequence. The user path runs it without the deadline and reports each step's start and end to the dialog. The OS path runs it with the budget. `quitConfirmation` becomes the data the dialog shows rather than message-box text, or is kept only for the fallback.

Out of scope here: stopping Agent CLIs gracefully, for example sending them their exit command and waiting so they save their session for resume, instead of killing the PTY. This ticket makes that possible on the user path, because that path no longer has to finish in 2 seconds. Whether to do it belongs with the resume work (mattpocock-ade/76).

Amend ADR 0004's Shutdown decision and the spec's "Lifecycle, packaging and release" lines: the 2-second budget applies to OS-forced shutdown only; a user quit shows its progress and offers "Quit now".

## Acceptance criteria

- [ ] Quitting with running sessions shows an in-app dialog listing each with agent, item, branch and state, waiting ones first; Cancel keeps everything running
- [ ] Quitting with no running session asks nothing and quits
- [ ] After confirming, the dialog shows each shutdown step's progress and the app quits when they are done
- [ ] "Quit now" during a slow step abandons the rest and quits at once (lifecycle unit test with a slow step, and an e2e test)
- [ ] A system shutdown or log-off still asks nothing and finishes within the 2-second budget (existing lifecycle tests stay)
- [ ] When the renderer does not answer the quit request in time, the native message box asks instead (unit test of the fallback decision)
- [ ] No tracker write and no network call on either path; every claim is as it was before quitting
- [ ] ADR 0004 and the spec say the 2-second budget is for OS-forced shutdown only

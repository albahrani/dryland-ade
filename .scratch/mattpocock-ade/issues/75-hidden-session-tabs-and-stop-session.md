# Hidden session tabs and Stop session

Type: task
Status: resolved
Blocked by: 74

Spec: [spec](../spec.md), user stories 96, 97. "Sessions, pausing and resuming". ADR 0010.

## What to build

Closing a session tab no longer ends the session; stopping it is a separate, deliberate action.

- **Hide**: closing a session tab leaves the PTY running (`TerminalManager.close` kills it today). The main process keeps a bounded buffer of each session's newest output and replays it into a fresh terminal when the session is shown again, from its ticket, its map or a next-up marker (the Sessions view follows in "Sessions view panes and status bar").
- **Unseen output**: output that arrives while a session is hidden or its tab is not active marks it unseen; showing it clears the mark. Exposed for the views and the quit dialog.
- **Stop session**: an action on the session tab and the ticket. It asks first when the session is running, or waiting or idle with unseen output. The rule is a setting (always ask / ask when busy or unseen, the default / never ask), kept as local UI state. Stopping kills the PTY and keeps the claim. The index keeps the last state, so the session reads as paused: "was waiting on you" after waiting, "interrupted" after running.
- A session the CLI ends on its own keeps today's behaviour (read-only output in its tab).

## Acceptance criteria

- [x] Closing a session tab leaves its process running, and its state keeps updating on the ticket
- [x] Showing the session again replays the output produced while hidden, within the buffer bound, and input works
- [x] Output beyond the bound keeps only the newest part (unit test)
- [x] Stop asks when the session is running, and when it is waiting or idle with unseen output; it does not ask when idle with nothing unseen
- [x] After Stop no PTY process is left, the ticket is still claimed, and the index entry keeps its last state
- [x] The confirmation setting changes the rule and persists across restarts
- [x] A Playwright test hides a session, lets the fake CLI write, and shows the output on reopening

## Comments

From mattpocock-ade/41 (bc47448): the quit dialog is built by quitConfirmation in packages/desktop/src/main/lifecycle.ts, which already lists waiting sessions first and leaves out sessions whose CLI reported its end. Put 'unseen output first' into its sort, and feed it hidden sessions too: index.ts lists runningSessions() from work.sessions() whose PTY is live, so a hidden session whose PTY keeps running is included once closing a tab stops killing it.

## Answer

Built in 1e28cf0. Closing a session tab hides the session: the renderer disposes its view, and the main process ignores terminal:close for session terminals. The TerminalManager keeps each live terminal's newest output in a bounded buffer (output-buffer.ts, 512K UTF-16 units; a cut drops the partial first line so no escape sequence is split), dropped when the PTY ends. Show session (on the ticket tab and the map tab, in a 'Live sessions' list) replays that buffer into a fresh xterm in the same task as the IPC reply, so later output follows in order. Unseen output (unseen-output.ts) is tracked by session id against the terminal in view (terminal:view), sent as sessions:unseen and in AppState.unseenSessions, and shown as a dot on the session tab and the Live sessions row. The quit dialog sorts waiting, then unseen ('idle, unseen output'), then the rest. Stop session (session header, Live sessions rows) runs session:stop: it kills the PTY and ends the live state, and writes nothing to the tracker or the index, so the claim and the index's last state stay. It asks first per stopNeedsConfirmation (shared/stop-session.ts): always / busy-or-unseen (default: running, or any live state with unseen output) / never. The setting is UiState.stopConfirmation, set from a new Sessions menu until Settings (55) takes it over. Tests: unit (buffer bound, terminal output lifetime, unseen, stop rule, quit sort, setting persistence), Playwright (hide, write while hidden, Show replays and takes input; Stop asks while working, stops at once when idle, PTY gone, claim and lastState kept), green on Windows and Linux. Known limits: a stopped session reads 'ended', not paused, until 'Feed live and paused sessions into the repo snapshot' (65); a next-up marker reaches the session via its ticket tab's Show session, not directly; the Sessions view (37) is not built; output of a session whose CLI ended while hidden is not kept; switching projects still kills every session, hidden ones included.

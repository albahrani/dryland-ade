# Hidden session tabs and Stop session

Type: task
Status: ready-for-agent
Blocked by: 74

Spec: [spec](../spec.md), user stories 96, 97. "Sessions, pausing and resuming". ADR 0010.

## What to build

Closing a session tab no longer ends the session; stopping it is a separate, deliberate action.

- **Hide**: closing a session tab leaves the PTY running (`TerminalManager.close` kills it today). The main process keeps a bounded buffer of each session's newest output and replays it into a fresh terminal when the session is shown again, from its ticket, its map or a next-up marker (the Sessions view follows in "Sessions view panes and status bar").
- **Unseen output**: output that arrives while a session is hidden or its tab is not active marks it unseen; showing it clears the mark. Exposed for the views and the quit dialog.
- **Stop session**: an action on the session tab and the ticket. It asks first when the session is running, or waiting or idle with unseen output. The rule is a setting (always ask / ask when busy or unseen, the default / never ask), kept as local UI state. Stopping kills the PTY and keeps the claim. The index keeps the last state, so the session reads as paused: "was waiting on you" after waiting, "interrupted" after running.
- A session the CLI ends on its own keeps today's behaviour (read-only output in its tab).

## Acceptance criteria

- [ ] Closing a session tab leaves its process running, and its state keeps updating on the ticket
- [ ] Showing the session again replays the output produced while hidden, within the buffer bound, and input works
- [ ] Output beyond the bound keeps only the newest part (unit test)
- [ ] Stop asks when the session is running, and when it is waiting or idle with unseen output; it does not ask when idle with nothing unseen
- [ ] After Stop no PTY process is left, the ticket is still claimed, and the index entry keeps its last state
- [ ] The confirmation setting changes the rule and persists across restarts
- [ ] A Playwright test hides a session, lets the fake CLI write, and shows the output on reopening

## Comments

From mattpocock-ade/41 (bc47448): the quit dialog is built by quitConfirmation in packages/desktop/src/main/lifecycle.ts, which already lists waiting sessions first and leaves out sessions whose CLI reported its end. Put 'unseen output first' into its sort, and feed it hidden sessions too: index.ts lists runningSessions() from work.sessions() whose PTY is live, so a hidden session whose PTY keeps running is included once closing a tab stops killing it.

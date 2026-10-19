# Remote trackers in the app

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-19T20:48:46.638Z","was":"ready-for-agent"}} -->
Blocked by: 30, 45

Spec: [spec](../spec.md), user stories 8 to 10, 24, 62. "Tracker write path", "UI".

## What to build

The app side of tracker differences.

- **Polling.** On GitHub and GitLab projects, tickets refresh on window focus and on a timer. No webhooks.
- **Tracker widget.** A widget in the menu bar shows which tracker the project uses and offers tracker-specific actions: reveal the issues folder for local-markdown, open issues in the browser for GitHub/GitLab. On local-markdown it also shows the warning when the main checkout is not on the default branch.
- **Lens mode.** A repo using a plain native tracker (not the ADE tracker) still works: Dryland reads and launches, and claims are best-effort. The widget says the project is in lens mode.
- **Tool problems.** Missing or logged-out `gh`/`glab` is shown as a clear state with the next action, not as an empty tree.

## Acceptance criteria

- [ ] On a GitHub project, a change made remotely appears after the window regains focus, and after the timer interval without focus change
- [ ] Polling does not run for local-markdown projects
- [ ] The tracker widget names the tracker and offers the right action per tracker
- [ ] On local-markdown with the main checkout off the default branch, the widget shows a warning
- [ ] A repo whose tracker doc names a plain native tracker opens in lens mode: tickets are shown, sessions can be started, and the widget says claims are best-effort
- [ ] With `gh` missing or logged out, the Tickets view shows the problem and the next action
- [ ] Polling is tested with a fake process runner and a fake clock

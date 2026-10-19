# Remote trackers in the app

Type: task
Status: resolved
Blocked by: 30, 45

Spec: [spec](../spec.md), user stories 8 to 10, 24, 62. "Tracker write path", "UI".

## What to build

The app side of tracker differences.

- **Polling.** On GitHub and GitLab projects, tickets refresh on window focus and on a timer. No webhooks.
- **Tracker widget.** A widget in the menu bar shows which tracker the project uses and offers tracker-specific actions: reveal the issues folder for local-markdown, open issues in the browser for GitHub/GitLab. On local-markdown it also shows the warning when the main checkout is not on the default branch.
- **Lens mode.** A repo using a plain native tracker (not the ADE tracker) still works: Dryland reads and launches, and claims are best-effort. The widget says the project is in lens mode.
- **Tool problems.** Missing or logged-out `gh`/`glab` is shown as a clear state with the next action, not as an empty tree.

## Acceptance criteria

- [x] On a GitHub project, a change made remotely appears after the window regains focus, and after the timer interval without focus change
- [x] Polling does not run for local-markdown projects
- [x] The tracker widget names the tracker and offers the right action per tracker
- [x] On local-markdown with the main checkout off the default branch, the widget shows a warning
- [ ] A repo whose tracker doc names a plain native tracker opens in lens mode: tickets are shown, sessions can be started, and the widget says claims are best-effort
- [x] With `gh` missing or logged out, the Tickets view shows the problem and the next action
- [x] Polling is tested with a fake process runner and a fake clock

## Answer

Built in b0bc8e2 and dd447d7. Core: readTrackerInfo/isAdeTrackerDoc (lens mode = tracker doc never mentions dryland, decided with the user), readTrackerWidget (kind, lens, main checkout off the default branch for local markdown); readProjectState now passes its runner on to readTickets. Desktop: TrackerPoller (60s timer plus window focus, remote trackers only, no overlapping reloads), tracker widget in the menu bar with Reveal issues folder / Open issues in browser and the branch and lens notes, polling and watching kept when the tracker read fails so a gh login recovers. docs/agents/issue-tracker.md now mentions dryland so this repo is the ADE tracker. Tests: tracker-widget (core, desktop), tracker-poller with a fake gh and fake clock, gh missing and logged out in project-state. Known limits: the lens-mode criterion is left unticked because starting a session in lens mode is not tested, and lens mode changes only the widget text, claims themselves are unchanged; the widget actions have no test; the doc is read twice in readTrackerInfo.

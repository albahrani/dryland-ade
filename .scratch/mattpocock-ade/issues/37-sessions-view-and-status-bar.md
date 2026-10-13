# Sessions view and status bar

Type: task
Status: ready-for-agent
Blocked by: 36

Spec: [spec](../spec.md), user stories 47, 54. "UI". Layout detail: the prototype in `prototype/views-and-ux/`.

## What to build

The Sessions view in the activity bar lists every session of the project with its agent icon and state badge. It can be grouped by map (default), by agent, by state, or ungrouped, through the view's "..." menu. Sessions that belong to no ticket appear in an Unlinked group. Selecting a session focuses its tab and drives the other panes.

The status bar shows the selected session's state, its branch, and the live/total session counts.

## Acceptance criteria

- [ ] Every session of the project appears with its current state badge, updating live
- [ ] Grouping can be switched between map, agent, state and ungrouped, and the choice is remembered
- [ ] A session without a ticket appears under Unlinked
- [ ] Selecting a session focuses its tab; selecting a ticket with a session selects that session
- [ ] The status bar shows the selected session's state and branch, and "live/total" session counts
- [ ] With no session selected, the status bar shows counts only

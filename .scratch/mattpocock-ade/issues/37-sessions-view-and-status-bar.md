# Sessions view panes and status bar

Type: task
Status: ready-for-agent
Blocked by: 75

Spec: [spec](../spec.md), user stories 47, 54, 103. "UI", "Sessions, pausing and resuming" (Sessions view layout). Layout detail: `prototype/views-and-ux/index.html?variant=B` and ticket 71's answer.

Rewritten when the paused-sessions build tickets were sliced: the Sessions view is built as split panes from the start. The Paused pane follows in "Paused pane and paused sessions on maps".

## What to build

The Sessions view in the activity bar as split panes, Hidden above Open (Paused will sit between them).

- **Panes**: headers never scroll away; each pane scrolls on its own, collapses to its header and is resized by dragging the sash between panes. Sizes and collapsed state are remembered per project. Header badges: waiting count (gold) before the total.
- **Hidden**: a tree by map, Unlinked last. Map groups start collapsed, groups with waiting sessions sort first, and waiting sessions stay visible under a collapsed group. A group shows `(waiting/total)`, or just the total, with the status breakdown in its tooltip. One-line rows: agent icon with state badge, item title, state and age, an unseen-output dot, Stop on hover.
- **Open**: the open session tabs, two-line rows (title, then the question or last output line), waiting first.
- **Grouping**: the view's "..." menu groups the Hidden tree by Map (default), Agent or None, remembered per project. No grouping by state.
- Selecting a session focuses or reopens its tab and drives the other panes.
- **Status bar**: the selected session's state and branch, and "N open · M hidden (k waiting)". The Sessions activity badge counts live waiting sessions.

## Acceptance criteria

- [ ] Every live session appears in Hidden or Open with its current state badge, updating live
- [ ] Hidden groups by map with Unlinked last, collapsed by default; waiting sessions float and stay visible under a collapsed group; counts read `(waiting/total)` with the breakdown in the tooltip
- [ ] Panes keep their headers in view, scroll separately, collapse, resize, and remember size and collapsed state
- [ ] Grouping switches between map, agent and none, and the choice is remembered
- [ ] Selecting a session focuses its tab, reopening a hidden one; selecting a ticket with a session selects that session
- [ ] The status bar shows the selected session's state and branch and the open and hidden counts; with no session selected, the counts only

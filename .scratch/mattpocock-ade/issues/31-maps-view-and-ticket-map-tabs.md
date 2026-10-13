# Maps view and ticket/map tabs

Type: task
Status: ready-for-agent
Blocked by: 30

Spec: [spec](../spec.md), user stories 18 to 20. "UI". Layout detail: the prototype in `prototype/views-and-ux/`.

## What to build

The Maps view in the activity bar: one row per map with a stacked progress bar (done, in progress, ready, blocked, fog), so efforts can be compared at a glance. Selecting a map shows a stats card.

A ticket or a map opens in an editor tab with a collapsible details header (status, type, claimant, blockers, parent map) above its rendered content. Tabs can be opened, switched, closed and are restored on restart. Selecting a ticket or map in either view drives the tab area.

The "Continue map" action on the stats card arrives with the New ticket and New map dialogs ticket.

## Acceptance criteria

- [ ] The Maps view lists every map of the project with a stacked progress bar matching its tickets and fog
- [ ] Selecting a map shows a stats card with the counts behind the bar
- [ ] Opening a ticket shows its body, answer and comments under a details header that collapses and expands
- [ ] Opening a map shows its content under a details header
- [ ] Opening the same item twice focuses the existing tab
- [ ] Open tabs are restored after a restart
- [ ] Content in an open tab updates when the file changes on disk

## Comments

From the review of 30: label, icon, meaning and sort order for ticket status live in four Record<TicketStatus,...> tables (status.tsx, Legend.tsx, view-options.ts). The stacked progress bar here is the second consumer; merge them into one STATUS_META table (label, shape, colour, meaning, order) when adding it.

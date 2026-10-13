# Maps view and ticket/map tabs

Type: task
Status: resolved
Blocked by: 30

Spec: [spec](../spec.md), user stories 18 to 20. "UI". Layout detail: the prototype in `prototype/views-and-ux/`.

## What to build

The Maps view in the activity bar: one row per map with a stacked progress bar (done, in progress, ready, blocked, fog), so efforts can be compared at a glance. Selecting a map shows a stats card.

A ticket or a map opens in an editor tab with a collapsible details header (status, type, claimant, blockers, parent map) above its rendered content. Tabs can be opened, switched, closed and are restored on restart. Selecting a ticket or map in either view drives the tab area.

The "Continue map" action on the stats card arrives with the New ticket and New map dialogs ticket.

## Acceptance criteria

- [x] The Maps view lists every map of the project with a stacked progress bar matching its tickets and fog
- [x] Selecting a map shows a stats card with the counts behind the bar
- [x] Opening a ticket shows its body, answer and comments under a details header that collapses and expands
- [x] Opening a map shows its content under a details header
- [x] Opening the same item twice focuses the existing tab
- [x] Open tabs are restored after a restart
- [x] Content in an open tab updates when the file changes on disk

## Comments

From the review of 30: label, icon, meaning and sort order for ticket status live in four Record<TicketStatus,...> tables (status.tsx, Legend.tsx, view-options.ts). The stacked progress bar here is the second consumer; merge them into one STATUS_META table (label, shape, colour, meaning, order) when adding it.

## Answer

Built in e23a698, tidied in ac92832. Core: readTicketDetail and readMapDetail (packages/core/src/item-detail.ts) read one ticket or map.md fresh. Desktop: Maps view with a stacked bar per map (done, in progress, ready, blocked, fog) and a stats card; tickets and maps open in editor tabs under a collapsible details header (status, type, claimant, blockers, parent map), rendered with react-markdown; opening an open item focuses its tab; tabs are saved per project in ui-state.json and restored on restart; open tabs re-read on every tracker file change. STATUS_META (label, shape, colour, meaning, order) replaces the four status tables from the review of 30. Tests: core item-detail, desktop map-progress, tabs and ui-state at Vitest seams, plus a second Playwright scenario (maps, tabs, focus, disk edit, restore). Decisions: a map known only through tickets opens with its details and a 'no map.md yet' note; the Tickets view gets an Open button on map rows so maps can be selected there too. Known limits: the Maps view has no '...' menu; map and ticket reading is local-markdown only until the GitHub/GitLab backends (45 to 47); the Windows e2e CI job is unchanged and has not run on GitHub.

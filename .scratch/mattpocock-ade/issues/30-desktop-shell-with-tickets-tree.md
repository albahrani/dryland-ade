# Desktop shell with the Tickets tree

Type: task
Status: resolved
Blocked by: 22

Spec: [spec](../spec.md), user stories 1, 11 to 16. "UI". ADRs 0002, 0004. Layout and interaction detail: the clickable prototype in `prototype/views-and-ux/` (reference only, not reused).

## What to build

The Electron app (React renderer, `electron-vite`) with the VS Code-style shell: menu bar, left activity bar (Tickets, Maps, Sessions), editor tab area, right side area, collapsible bottom panel and status bar. Areas that later tickets fill may be empty placeholders.

The user opens a local git repo as a project and sees the Tickets view: tickets grouped by map, then by ticket kind (Fog, Planning, Implementation). Status (ready, in progress, blocked, done) is an icon with a text tooltip. Done tickets fold into one "N done" line. The claimant and the blockers of a ticket are visible. The view has inline actions and a "..." menu (expand/collapse, sort, filters, show done/fog). A dismissible legend explaining the icons is shown initially.

The tree refreshes when tracker files change on disk (file watching in the main process). The open project is remembered across restarts as local UI state.

Adds the one Playwright-for-Electron smoke test and its Windows CI job.

## Acceptance criteria

- [x] Opening a repo with local-markdown tickets shows them grouped by map and ticket kind
- [x] Status is shown as an icon with a tooltip; done tickets are folded into an "N done" line that expands
- [x] Claimant and blockers are shown; blockers the backend cannot determine show as "unknown"
- [x] Editing a ticket file on disk updates the tree without a restart
- [x] The "..." menu offers expand/collapse, sort, filters and show done/fog
- [x] The legend is shown on first use and stays dismissed afterwards
- [x] The app reopens the last project on restart
- [ ] The Playwright smoke test (launch, open a fixture repo, see the tickets tree) passes on Windows and runs in CI

## Answer

Built in bc9a15d. Core: readTicketsTree (packages/core/src/tickets-tree.ts) groups tickets by map then kind (Fog listed from map.md, Planning, Implementation) with status ready/in-progress/blocked/done, claimant, unresolved blockers or unknown, and one folded done group per map. Desktop: electron-vite + React shell (menu bar with project widget, activity bar, sidebar, editor, right side, collapsible live-events panel, status bar), Tickets view with legend, '...' menu (expand/collapse, sort, status filters, show done/fog), recursive fs.watch refresh that re-arms when .scratch or docs appear, atomic ui-state.json remembering last project and dismissed legend. Tests: Vitest seams for the tree builder, UI state store and view options; one Playwright-for-Electron smoke scenario (open, tree, fold, disk edit refresh, relaunch restores project and legend) plus a windows-latest e2e CI job. Decisions: dialog stubbed from the test via electronApp.evaluate; core bundled into main (devDependency); vite 7 because electron-vite 5 needs it; Electron binary download skipped in the unit-test jobs and test:linux. Known limits: the Windows e2e CI job has not run on GitHub yet, so that acceptance criterion stays unticked; Maps and Sessions views, tracker widget, inline row actions and menu items beyond File/View are placeholders for later tickets; open tickets with unknown blockers show as blocked, matching the frontier rule; the legend appears only once a project is open.

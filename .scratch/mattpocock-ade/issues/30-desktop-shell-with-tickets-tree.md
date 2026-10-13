# Desktop shell with the Tickets tree

Type: task
Status: ready-for-agent
Blocked by: 22

Spec: [spec](../spec.md), user stories 1, 11 to 16. "UI". ADRs 0002, 0004. Layout and interaction detail: the clickable prototype in `prototype/views-and-ux/` (reference only, not reused).

## What to build

The Electron app (React renderer, `electron-vite`) with the VS Code-style shell: menu bar, left activity bar (Tickets, Maps, Sessions), editor tab area, right side area, collapsible bottom panel and status bar. Areas that later tickets fill may be empty placeholders.

The user opens a local git repo as a project and sees the Tickets view: tickets grouped by map, then by ticket kind (Fog, Planning, Implementation). Status (ready, in progress, blocked, done) is an icon with a text tooltip. Done tickets fold into one "N done" line. The claimant and the blockers of a ticket are visible. The view has inline actions and a "..." menu (expand/collapse, sort, filters, show done/fog). A dismissible legend explaining the icons is shown initially.

The tree refreshes when tracker files change on disk (file watching in the main process). The open project is remembered across restarts as local UI state.

Adds the one Playwright-for-Electron smoke test and its Windows CI job.

## Acceptance criteria

- [ ] Opening a repo with local-markdown tickets shows them grouped by map and ticket kind
- [ ] Status is shown as an icon with a tooltip; done tickets are folded into an "N done" line that expands
- [ ] Claimant and blockers are shown; blockers the backend cannot determine show as "unknown"
- [ ] Editing a ticket file on disk updates the tree without a restart
- [ ] The "..." menu offers expand/collapse, sort, filters and show done/fog
- [ ] The legend is shown on first use and stays dismissed afterwards
- [ ] The app reopens the last project on restart
- [ ] The Playwright smoke test (launch, open a fixture repo, see the tickets tree) passes on Windows and runs in CI

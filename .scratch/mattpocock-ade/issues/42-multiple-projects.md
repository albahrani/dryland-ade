# Multiple projects

Type: task
Status: resolved
Blocked by: 37

Spec: [spec](../spec.md), user stories 2 to 5. "UI". Layout detail: `prototype/views-and-ux/` (project switching).

## What to build

Several projects open at once. A project widget in the menu bar shows the current project and switches between open ones. An All Projects dialog lists each project's tracker, live session count and next-up item, so the user can decide where to go next.

Each project keeps its own open tabs. Sessions in other projects keep running when the user switches; switching never interrupts an agent. There is no global branch selector: a branch belongs to a worktree.

## Acceptance criteria

- [x] A second repo can be opened as a project without closing the first
- [x] The project widget switches projects, and all views and panes follow
- [x] Switching away and back restores that project's tabs and selection
- [x] A session keeps running and keeps reporting state while another project is shown
- [x] The All Projects dialog lists tracker, live session count and next-up item per project, and opens the chosen one
- [x] The status bar's session counts refer to the current project
- [x] The list of open projects is restored on restart
- [x] A project can be closed; its live sessions are listed for confirmation first

## Answer

Built in c921fd4 and e7a4a6b. The menu bar's project widget lists the open projects and switches between them; its menu also has Open project... and All projects.... The All Projects dialog lists each project's tracker, live session count and next-up item, opens the chosen one, and closes one after listing the sessions that would stop. Sessions record their project (SessionInfo.project), so the views, markers, paused map and status bar counts follow the shown project while other projects' sessions keep running and reporting. The renderer remembers each project's tabs while the app runs; the open projects persist in ui-state (openProjects) and come back on restart. Closing a project ends its sessions and plain terminals (claims are kept, so sessions read as paused). Known limits: the tracker label is fixed to Local markdown until the GitHub and GitLab backends land; only the shown project is watched, reconciled and covered by resume-on-start, and the others catch up when switched to; a project that fails to load is shown but not added to the open list. Tested by unit tests, two Playwright specs (multiple-projects.spec.ts) and the full suites on Windows and Linux.

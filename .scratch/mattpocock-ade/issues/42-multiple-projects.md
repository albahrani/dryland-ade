# Multiple projects

Type: task
Status: ready-for-agent
Blocked by: 37

Spec: [spec](../spec.md), user stories 2 to 5. "UI". Layout detail: `prototype/views-and-ux/` (project switching).

## What to build

Several projects open at once. A project widget in the menu bar shows the current project and switches between open ones. An All Projects dialog lists each project's tracker, live session count and next-up item, so the user can decide where to go next.

Each project keeps its own open tabs. Sessions in other projects keep running when the user switches; switching never interrupts an agent. There is no global branch selector: a branch belongs to a worktree.

## Acceptance criteria

- [ ] A second repo can be opened as a project without closing the first
- [ ] The project widget switches projects, and all views and panes follow
- [ ] Switching away and back restores that project's tabs and selection
- [ ] A session keeps running and keeps reporting state while another project is shown
- [ ] The All Projects dialog lists tracker, live session count and next-up item per project, and opens the chosen one
- [ ] The status bar's session counts refer to the current project
- [ ] The list of open projects is restored on restart
- [ ] A project can be closed; its live sessions are listed for confirmation first

# Explorer with file and diff tabs

Type: task
Status: ready-for-agent
Blocked by: 33

Spec: [spec](../spec.md), user story 72. "UI". Layout detail: `prototype/views-and-ux/`.

## What to build

The Explorer in the right side area: a file tree of the worktree that belongs to the selected ticket or session. With nothing selected, or a ticket without a worktree, it shows the main checkout.

Clicking a file opens it in a read-only file tab. A changed file can be opened as a diff tab against the worktree's base. This is for reviewing what the agent did; Dryland is not an editor.

## Acceptance criteria

- [ ] Selecting a ticket or session switches the Explorer to its worktree and labels which worktree is shown
- [ ] A ticket without a worktree shows the main checkout
- [ ] A file opens in a read-only tab with syntax highlighting
- [ ] A changed file opens as a diff tab showing the change
- [ ] The tree and open file tabs update when files change on disk
- [ ] Ignored and very large directories do not freeze the tree

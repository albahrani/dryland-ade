# Explorer with file and diff tabs

Type: task
Status: resolved
Blocked by: 33

Spec: [spec](../spec.md), user story 72. "UI". Layout detail: `prototype/views-and-ux/`.

## What to build

The Explorer in the right side area: a file tree of the worktree that belongs to the selected ticket or session. With nothing selected, or a ticket without a worktree, it shows the main checkout.

Clicking a file opens it in a read-only file tab. A changed file can be opened as a diff tab against the worktree's base. This is for reviewing what the agent did; Dryland is not an editor.

## Acceptance criteria

- [x] Selecting a ticket or session switches the Explorer to its worktree and labels which worktree is shown
- [x] A ticket without a worktree shows the main checkout
- [x] A file opens in a read-only tab with syntax highlighting
- [x] A changed file opens as a diff tab showing the change
- [x] The tree and open file tabs update when files change on disk
- [x] Ignored and very large directories do not freeze the tree

## Answer

Built the Explorer in the right side area (commit 80cbaf9). It shows the worktree of the focused ticket tab or session terminal tab, labelled 'Worktree <branch>' or 'Main checkout (<branch>)' (main checkout for nothing selected, map tabs, and tickets without a worktree). Directories load lazily; git-ignored entries are listed dimmed and cannot be expanded, and a directory is capped at 2000 entries. Files open in read-only tabs, highlighted with highlight.js (common languages, plain text above 200k chars); files over 1 MB are cut and binary files are not shown. A Changes list and per-row M/A/D/U buttons open a diff tab against the worktree's merge-base with the default branch (uncommitted changes against HEAD in the main checkout); untracked files diff as all added. Only the open directories and the parents of open file tabs are watched (non-recursive), so the tree, Changes and open tabs follow the disk. The main process checks every root against git's worktree list and every path stays inside it. Tested: explorer.test.ts, diff.test.ts, tabs.test.ts and e2e/explorer.spec.ts; full suite and e2e pass on Windows and Linux. Known limits: file and diff tabs are not restored after a restart; commits made without a file change do not refresh the Changes list until something in a watched directory changes; Source Control is still the later ticket; the renderer bundle grew to about 1.8 MB with highlight.js.

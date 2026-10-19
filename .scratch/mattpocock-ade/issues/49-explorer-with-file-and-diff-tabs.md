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

## Follow-ups

Left open after the code review of 80cbaf9..2243c14 (later commits `3f35901` and `2243c14` fixed the rest of what it found):

- **Source Control overlap:** the Changes list, its M/A/D/U badges and the 2-second poll behind it sit in the Explorer. Check them against ticket 50 so the two do not build the same list twice.
- **Tabs after a restart:** file and diff tabs are not saved. They could be, once a restored tab checks that its worktree still exists.
- **Linking:** a ticket's worktree is found by its branch name only. One linked by a commit trailer shows the main checkout.
- **Base fallback:** when the merge-base lookup fails, the diff falls back to HEAD without saying so.
- **Watchers:** `explorerWatch` replaces all watchers and `watchedDirs` covers the current root only, so a file tab left open in another root can lose its watcher.
- **Large directories:** the 2000-entry cap is applied after the directory is read and sorted. A directory of a million entries still costs that read.
- **Error state:** a failing `explorerRoot` shows a raw error in place of the tree.
- **Refresh cost:** every watched change reloads every open listing.
- **Bundle:** highlight.js `common` makes the renderer about 1.8 MB; load languages on demand if startup shows it.
- **Glossary:** the label says "Worktree <branch>" where `GLOSSARY.md` has Linked worktree, Scratch worktree and Unlinked branch, and "base" has no entry.
- **Code shape:** `FileRef` and `DiffRef` are the same shape, `kind === "file" || kind === "diff"` recurs, `(root, path)` travels together, `useLoaded` returns `T | "error" | null`, `Explorer` takes `projectView: unknown` only as an effect dependency, `createExplorer` is one 200-line closure, and `explorerFor()` rebuilds it on every call.
- **Test gap:** on Windows the commit-refresh e2e passes without the git-directory watch, because Windows reports a subdirectory's changes on the parent watch. Only Linux and the `explorer-watch` unit test prove it.

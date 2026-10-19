# Source Control

Type: task
Status: resolved
Blocked by: 49

Spec: [spec](../spec.md), user stories 71, 73. "UI", "Worktrees and linking". Layout detail: `prototype/views-and-ux/`.

## What to build

The Source Control pane in the right side area, scoped to the worktree of the selected ticket or session: the branch, staged and changed files, a commit box, and a commit graph. There is no global branch selector; a branch belongs to a worktree.

The user can stage and unstage files, open a file's diff, and commit with a message. The commit graph shows the worktree branch against the default branch.

Branches and worktrees Dryland did not create are shown as Unlinked branches. A commit trailer naming a ticket is the fallback link, so nothing is silently mismatched.

Git is reached through the process-runner interface.

## Acceptance criteria

- [x] Selecting a ticket or session shows its worktree's branch, staged files and changed files
- [x] Files can be staged and unstaged, and clicking one opens its diff tab
- [x] Committing from the commit box creates a commit in that worktree only
- [x] The commit graph shows the branch's commits relative to the default branch
- [x] A branch that matches neither the naming convention nor a commit trailer is listed as unlinked
- [x] A branch linked only by commit trailer is shown under its ticket
- [x] The pane updates when the agent changes or commits files
- [x] Git behaviour is tested against a temp git repo

## Notes from ticket 49

Ticket 49 (Explorer) already built part of what this ticket describes. Settle it when picking this up:

- **Same list, different base.** The Explorer's `Changes` list (`packages/desktop/src/main/explorer.ts`, `changes()`) shows files changed since the worktree's merge-base with the default branch (uncommitted changes in the main checkout), staged and unstaged together. Source Control needs staged and changed files apart, against HEAD. They are different questions; do not stretch `changes()` to answer both.
- **Keep in the Explorer:** the M/A/D/U badge on a tree row and its diff button. Ticket 49's criterion "A changed file opens as a diff tab" needs them.
- **Likely move or drop:** the Explorer's `Changes (N)` panel duplicates this pane's changed-files list. Once Source Control shows it, remove the panel from the Explorer (keep the badges).
- **Reuse, do not rebuild:** diff tabs (`DiffRef`, `DiffTab`, `parseUnifiedDiff`), the worktree selection (`explorerHint` in `App.tsx`, `resolveRoot`), the git-directory watch (`createExplorerWatcher`, which fires on HEAD and index changes) and the 2-second changed-files poll. Source Control's "updates when the agent changes or commits files" criterion is mostly this wiring: lift the refresh signal out of `Explorer.tsx` so both panes share it.
- **Reading git:** the Explorer runs git with `--no-optional-locks` so its own reads never touch the index and re-trigger the watch. Do the same for Source Control's reads; its writes (stage, unstage, commit) will fire the watch, which is wanted.
- **Linking:** `listWorktrees` in core already returns each worktree's link (`name`, `trailer`, `scratch`, `unlinked`), covering the "unlinked" and "linked only by trailer" criteria. The Explorer only matches `link.kind === "name"`, so a trailer-linked branch shows the main checkout there; fix it once, for both panes.

## Answer

Built the Source Control pane (commits 4c81ed4, 51cdefa): packages/desktop/src/main/source-control.ts reads and writes git through the process runner (status staged vs changed against HEAD, stage, unstage, commit, graph vs the default branch, unlinked worktrees), shown by SourceControl.tsx under the Explorer. The Explorer's Changes panel is gone (badges stay), and resolveRoot now selects a trailer-linked branch as its ticket's worktree. Updates ride the Explorer's git-dir watch plus a 2s poll. Decisions: file clicks open the existing diff tab (against the worktree base, not HEAD); unmerged files list once as changed; a 'Show' button on an unlinked branch re-points both panes until the tab changes. Known limits: the graph is a flat list (branch commits, then a few base commits), unlinked lists worktrees only (not worktree-less branches), renames show as delete plus add, and the Explorer and Source Control each run their own 2s poll.

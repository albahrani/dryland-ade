# Local merge and prune

Type: task
Status: resolved
Blocked by: 26, 39, 50

Spec: [spec](../spec.md), user stories 74, 75, 77, 78. "CLI surface". Layout detail: `prototype/views-and-ux/` (Merge/PR).

## What to build

The Merge/PR section in Source Control, for local-markdown projects: finish a ticket inside Dryland.

Before merging, dry-run checks run: a dirty tree and conflicts block the merge; an unresolved ticket is only a hint. The user chooses a merge strategy and merges the worktree branch into the default branch, with optional cleanup of worktree and branch afterwards.

Dryland never resolves conflicts itself. When the dry run finds conflicts, the user can hand them to the agent: a prompt describing the conflict is pre-typed into the ticket's session.

Pruning goes through `dryland worktree prune` and is only possible when the ticket is resolved, the branch is merged or empty, the tree is clean and no session is attached. The app supplies the session-attached fact and asks for confirmation.

## Acceptance criteria

- [x] The section shows the dry-run result: dirty tree and conflicts as blockers, unresolved ticket as a hint
- [x] With blockers present, the merge action is disabled and says why
- [x] A clean branch merges with the chosen strategy, and the result is visible in the commit graph
- [x] With cleanup chosen, worktree and branch are removed after the merge, subject to the prune conditions
- [x] On conflicts, "hand to agent" pre-types a prompt into the ticket's session and Dryland changes no file
- [x] Prune is refused, naming the failed condition, when any of the four conditions does not hold, including a live session in the worktree
- [x] Prune asks for confirmation in the app
- [x] Merge and prune behaviour is tested against a temp git repo

## Answer

Built the Merge section of Source Control for local-markdown projects. Core: checkMerge (dry run: dirty worktree, dirty main checkout, main off the default branch, nothing to merge, and conflicts via git merge-tree are blockers; an unresolved ticket is a hint) and mergeWorktree (merge commit, fast-forward or squash in the main checkout, optional cleanup through pruneWorktree whose refusal is reported without undoing the merge) in packages/core/src/merge.ts. Desktop: createSourceControl gained mergeCheck, merge, prune and handConflictsToAgent, wired through IPC; the app supplies the session-attached fact from live terminals and types the conflict prompt (single line, not submitted) into the worktree's live session through the pre-typer, changing no file; MergePanel.tsx shows the dry run, disables Merge with the reason, and confirms Prune inline. Tests against temp git repos: packages/core/test/merge.test.ts, packages/desktop/test/source-control-merge.test.ts; pnpm test and pnpm test:linux pass. Commit: see git log (Local merge and prune in Source Control). Known limits: squash merges are not seen as merged by prune, so cleanup after a squash is refused; no Playwright test of MergePanel yet; hand-to-agent needs a live session in the worktree.

# Local merge and prune

Type: task
Status: ready-for-agent
Blocked by: 26, 39, 50

Spec: [spec](../spec.md), user stories 74, 75, 77, 78. "CLI surface". Layout detail: `prototype/views-and-ux/` (Merge/PR).

## What to build

The Merge/PR section in Source Control, for local-markdown projects: finish a ticket inside Dryland.

Before merging, dry-run checks run: a dirty tree and conflicts block the merge; an unresolved ticket is only a hint. The user chooses a merge strategy and merges the worktree branch into the default branch, with optional cleanup of worktree and branch afterwards.

Dryland never resolves conflicts itself. When the dry run finds conflicts, the user can hand them to the agent: a prompt describing the conflict is pre-typed into the ticket's session.

Pruning goes through `dryland worktree prune` and is only possible when the ticket is resolved, the branch is merged or empty, the tree is clean and no session is attached. The app supplies the session-attached fact and asks for confirmation.

## Acceptance criteria

- [ ] The section shows the dry-run result: dirty tree and conflicts as blockers, unresolved ticket as a hint
- [ ] With blockers present, the merge action is disabled and says why
- [ ] A clean branch merges with the chosen strategy, and the result is visible in the commit graph
- [ ] With cleanup chosen, worktree and branch are removed after the merge, subject to the prune conditions
- [ ] On conflicts, "hand to agent" pre-types a prompt into the ticket's session and Dryland changes no file
- [ ] Prune is refused, naming the failed condition, when any of the four conditions does not hold, including a live session in the worktree
- [ ] Prune asks for confirmation in the app
- [ ] Merge and prune behaviour is tested against a temp git repo

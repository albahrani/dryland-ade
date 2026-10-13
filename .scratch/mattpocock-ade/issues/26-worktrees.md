# Worktrees: create, list and prune

Type: task
Status: ready-for-agent
Blocked by: 24

Spec: [spec](../spec.md), user stories 49, 73, 78. "Worktrees and linking". ADR 0001.

## What to build

`dryland worktree create`, `list` and `prune`.

`create` makes one worktree and branch per ticket, named `<effort>/<NN>-<slug>`. Without a ticket it makes a scratch worktree named `<effort>/scratch-<slug>`. Slugs are collision-suffixed. `list` shows each worktree with the ticket it links to; a Linked worktree is tied to its ticket by that name, with a commit trailer as fallback, and a branch matching neither is an Unlinked branch.

`prune` removes a worktree and its branch only if the ticket is resolved, the branch is merged or empty, the worktree is clean and no session is attached. It needs `--yes`. Whether a session is attached is passed in by the caller for now; the app supplies it later.

Small pieces for slugify and collision suffixing may be copied from Orca with MIT attribution recorded for `THIRD_PARTY_NOTICES`.

## Acceptance criteria

- [ ] `worktree create` for a ticket produces a worktree and branch named `<effort>/<NN>-<slug>`
- [ ] Creating a second worktree whose slug collides gets a suffix instead of failing
- [ ] `worktree create` without a ticket produces a `<effort>/scratch-<slug>` worktree
- [ ] `worktree list` shows the linked ticket by name, falls back to the commit trailer, and marks everything else as unlinked
- [ ] `worktree prune` refuses, naming the failed condition, when the ticket is unresolved, the branch has unmerged commits, the tree is dirty or a session is attached
- [ ] `worktree prune` without `--yes` does nothing and says so
- [ ] When all conditions hold and `--yes` is given, worktree and branch are removed

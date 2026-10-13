# Source Control

Type: task
Status: ready-for-agent
Blocked by: 49

Spec: [spec](../spec.md), user stories 71, 73. "UI", "Worktrees and linking". Layout detail: `prototype/views-and-ux/`.

## What to build

The Source Control pane in the right side area, scoped to the worktree of the selected ticket or session: the branch, staged and changed files, a commit box, and a commit graph. There is no global branch selector; a branch belongs to a worktree.

The user can stage and unstage files, open a file's diff, and commit with a message. The commit graph shows the worktree branch against the default branch.

Branches and worktrees Dryland did not create are shown as Unlinked branches. A commit trailer naming a ticket is the fallback link, so nothing is silently mismatched.

Git is reached through the process-runner interface.

## Acceptance criteria

- [ ] Selecting a ticket or session shows its worktree's branch, staged files and changed files
- [ ] Files can be staged and unstaged, and clicking one opens its diff tab
- [ ] Committing from the commit box creates a commit in that worktree only
- [ ] The commit graph shows the branch's commits relative to the default branch
- [ ] A branch that matches neither the naming convention nor a commit trailer is listed as unlinked
- [ ] A branch linked only by commit trailer is shown under its ticket
- [ ] The pane updates when the agent changes or commits files
- [ ] Git behaviour is tested against a temp git repo

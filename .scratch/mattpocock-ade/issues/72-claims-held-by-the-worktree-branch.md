# Claims held by the worktree branch

Type: task
Status: ready-for-agent

Spec: [spec](../spec.md), user stories 56, 63. "Sessions, pausing and resuming". ADR 0010.

## What to build

A claim's holder is always a branch, never a Dryland session id, so a claim survives the session that made it.

- **Start work** claims the ticket for its worktree branch (`<map>/<NN>-<slug>`): `startWork` runs the claim from the ticket's worktree instead of passing the session id as holder.
- **`dryland ticket claim`** claims for the branch of its working directory even when `DRYLAND_SESSION_ID` is set. Run by an agent inside a ticket's worktree, that is the worktree branch.
- **The stale-claim rule** never flags a claim whose holder is the branch of an existing ticket worktree, live session or not (the git state of the snapshot says which worktrees exist). It still flags a claim held by the default branch, or by a name that is no checked-out worktree, when no live session works on the ticket. Paused sessions join this rule in "Feed live and paused sessions into the repo snapshot".

Claims written by earlier builds name a session id; they read as possibly stale and are released by hand. No migration.

## Acceptance criteria

- [ ] Starting work claims the ticket for its worktree branch, and `dryland ticket show` names that branch as the claimant
- [ ] `dryland ticket claim` inside a Dryland session claims for the branch of its working directory, not for `DRYLAND_SESSION_ID`
- [ ] Claiming again from the same worktree changes nothing and says the branch already holds it
- [ ] No stale-claim step for a claim held by the branch of an existing ticket worktree, with no live session
- [ ] A stale-claim step for a claim held by the default branch, and for one whose holder names no checked-out worktree, when no live session works on the ticket
- [ ] A claim held by an old session id reads as possibly stale

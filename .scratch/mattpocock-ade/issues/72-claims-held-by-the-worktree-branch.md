# Claims held by the worktree branch

Type: task
Status: resolved

Spec: [spec](../spec.md), user stories 56, 63. "Sessions, pausing and resuming". ADR 0010.

## What to build

A claim's holder is always a branch, never a Dryland session id, so a claim survives the session that made it.

- **Start work** claims the ticket for its worktree branch (`<map>/<NN>-<slug>`): `startWork` runs the claim from the ticket's worktree instead of passing the session id as holder.
- **`dryland ticket claim`** claims for the branch of its working directory even when `DRYLAND_SESSION_ID` is set. Run by an agent inside a ticket's worktree, that is the worktree branch.
- **The stale-claim rule** never flags a claim whose holder is the branch of an existing ticket worktree, live session or not (the git state of the snapshot says which worktrees exist). It still flags a claim held by the default branch, or by a name that is no checked-out worktree, when no live session works on the ticket. Paused sessions join this rule in "Feed live and paused sessions into the repo snapshot".

Claims written by earlier builds name a session id; they read as possibly stale and are released by hand. No migration.

## Acceptance criteria

- [x] Starting work claims the ticket for its worktree branch, and `dryland ticket show` names that branch as the claimant
- [x] `dryland ticket claim` inside a Dryland session claims for the branch of its working directory, not for `DRYLAND_SESSION_ID`
- [x] Claiming again from the same worktree changes nothing and says the branch already holds it
- [x] No stale-claim step for a claim held by the branch of an existing ticket worktree, with no live session
- [x] A stale-claim step for a claim held by the default branch, and for one whose holder names no checked-out worktree, when no live session works on the ticket
- [x] A claim held by an old session id reads as possibly stale

## Answer

Built in 5a267f8. A claim's holder is now always a branch. Start work runs dryland ticket claim from the ticket's worktree, so the worktree branch (<map>/<NN>-<slug>) holds the claim; the session id is still passed, but only to name the session on live events. dryland ticket claim always uses branchHolder(cwd) and ignores DRYLAND_SESSION_ID. WorktreeGitState gained branches (the ticket's worktree branches still on disk), and the stale-claim rule skips a claim whose holder is any of them; otherwise it flags the claim unless a live session works on the ticket. The rule no longer matches a holder against live session ids, so claims from earlier builds (session ids) read as possibly stale; no migration. Its reason and evidence now name the claimant and the worktree check, and the ticket panel's stale text says the same. Decision: only ticket worktrees protect a claim, per ADR 0010 and the glossary; a claim made from a scratch worktree (e.g. a /wayfinder session) still reads possibly stale until 65 feeds paused sessions in. When git state is unknown (no default branch), no branch protects a claim. Tests: core rule and real-repo snapshot tests, CLI claim tests from worktrees (parallel contention now uses 8 worktrees), desktop Start work and dryland-cli tests, e2e claimOutside claims from a worktree. pnpm test and pnpm test:linux (344), e2e native and Linux (22) all pass.

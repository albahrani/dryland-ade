# Feed live and paused sessions into the repo snapshot

Type: task
Status: ready-for-agent
Blocked by: 72, 74

Spec: [spec](../spec.md), user stories 63, 99. "Sessions, pausing and resuming", "Next-step rule engine". ADRs 0007, 0010.

Rewritten when the paused-sessions build tickets were sliced: this now carries the claim states as well as the live sessions. Originally split from 64.

## What to build

`readRepoSnapshot` (`packages/core/src/repo-snapshot.ts`) leaves `sessions` null, so waiting-session and stale-claim never fire outside tests. The app fills it from its live sessions (state from session status) and the session index.

- **Paused sessions**: a claimed ticket whose index entry has a session and no live session is paused. `SessionSnapshot` gains the paused state and what it was: "was waiting on you" from last state waiting, "interrupted" from running, plain "Paused" from idle or no last state.
- **Claim states**: live, paused, or possibly stale (the stale-claim rule as changed by "Claims held by the worktree branch"). A paused claim is never possibly stale.
- **Next steps in order**: live waiting sessions, then a new paused-was-waiting rule (no command; target the ticket; reason and evidence name the paused session), then stale claims.
- `null` still means unknown and flags nothing. The `dryland` CLI, which cannot see live sessions, keeps `null`.

## Acceptance criteria

- [ ] A claimed ticket with no live and no indexed session yields stale-claim (subject to the worktree-branch exception)
- [ ] A claimed ticket with an indexed session and no live one yields no stale-claim and reads as paused with its label
- [ ] A paused session whose last state was waiting yields paused-was-waiting, ranked after live waiting sessions and before stale claims
- [ ] A live waiting session yields waiting-session
- [ ] `null` sessions flag no claim
- [ ] "Why not this?" on a paused ticket says it is paused, not stale

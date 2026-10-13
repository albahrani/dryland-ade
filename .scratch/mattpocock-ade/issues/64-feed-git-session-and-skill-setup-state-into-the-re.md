# Feed git, session and skill-setup state into the repo snapshot

Type: task
Blocked by: 29
Status: resolved

## Comments

Scope: readRepoSnapshot (packages/core/src/repo-snapshot.ts) still fills git, sessions and skillSetup with null, so the rules added in ticket 29 (waiting-session, stale-claim, review-before-pr, open-pr, retro, compatibility disabling) never fire outside tests. Fill them: git from the Linked worktrees (exists, ahead of the default branch, merged, optional PR exists); sessions from the live session list; skillSetup from the fingerprint state, the Compatibility verdict keyed by rule id, and the user's overrides. Keep null meaning unknown, never an empty guess: null sessions must not make every claim stale. Acceptance: a snapshot read from a temp git repo with a Linked worktree ahead of main yields review-before-pr and open-pr; a claimed ticket with no live session yields stale-claim; a broken verdict disables its rule. The data sources arrive with the worktree (26, 51), session (35 to 38) and skill-setup (53, 54) tickets; feed each in as it lands, or do this once they are all in.

## Answer

Fed the git half of the repo snapshot: readRepoSnapshot(runner, mainCheckout, tickets) now reads each ticket-linked Linked worktree (exists, ahead of the default branch, merged) via readTicketWorktreeStates in worktree.ts, so review-before-pr, open-pr and retro fire from a real repo. Commits 71baf17, 0dafd9e. Decisions: git is null (unknown) outside a repo, with no default branch, or on a failed comparison; merged = not ahead and tip is not the branch's creation commit per the reflog (fast-forward merges count; squash merges are not seen, a branch reset backwards reads as merged); prExists stays null until the forge tickets (52) land, which the rules treat as no PR; worktrees of one ticket fold to one entry counting only those on disk. Split out: sessions (stale-claim, waiting-session) is 65, blocked by 35-38; skill setup and the broken-verdict disabling is 66, blocked by 53, 54. Known limit: sessions and skillSetup stay null until then.

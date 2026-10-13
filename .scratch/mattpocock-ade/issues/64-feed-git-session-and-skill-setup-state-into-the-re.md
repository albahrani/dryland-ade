# Feed git, session and skill-setup state into the repo snapshot

Type: task
Blocked by: 29

## Comments

Scope: readRepoSnapshot (packages/core/src/repo-snapshot.ts) still fills git, sessions and skillSetup with null, so the rules added in ticket 29 (waiting-session, stale-claim, review-before-pr, open-pr, retro, compatibility disabling) never fire outside tests. Fill them: git from the Linked worktrees (exists, ahead of the default branch, merged, optional PR exists); sessions from the live session list; skillSetup from the fingerprint state, the Compatibility verdict keyed by rule id, and the user's overrides. Keep null meaning unknown, never an empty guess: null sessions must not make every claim stale. Acceptance: a snapshot read from a temp git repo with a Linked worktree ahead of main yields review-before-pr and open-pr; a claimed ticket with no live session yields stale-claim; a broken verdict disables its rule. The data sources arrive with the worktree (26, 51), session (35 to 38) and skill-setup (53, 54) tickets; feed each in as it lands, or do this once they are all in.

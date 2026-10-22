# Feed skill-setup state and Compatibility verdict into the repo snapshot

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T10:14:06.279Z","was":""}} -->
Blocked by: 53, 54

## Question

Scope: readRepoSnapshot (packages/core/src/repo-snapshot.ts) leaves skillSetup null, so a broken Compatibility verdict never disables its rule outside tests. Fill skillSetup from the fingerprint state, the verdict keyed by rule id, and the user's overrides. Keep null meaning unknown, never an empty guess. Acceptance: a broken verdict disables its rule; an override re-enables it; no valid verdict disables nothing. Split from 64.

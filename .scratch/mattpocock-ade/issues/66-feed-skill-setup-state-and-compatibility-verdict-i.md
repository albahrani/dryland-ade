# Feed skill-setup state and Compatibility verdict into the repo snapshot

Type: task
Status: resolved
Blocked by: 53, 54

## Question

Scope: readRepoSnapshot (packages/core/src/repo-snapshot.ts) leaves skillSetup null, so a broken Compatibility verdict never disables its rule outside tests. Fill skillSetup from the fingerprint state, the verdict keyed by rule id, and the user's overrides. Keep null meaning unknown, never an empty guess. Acceptance: a broken verdict disables its rule; an override re-enables it; no valid verdict disables nothing. Split from 64.

## Answer

No new code: ticket 54 (commits 9a9e80f, 0b04541, b5bee16) already fed the snapshot. skillSetupSnapshot (compat.ts) builds the fingerprint state, the verdict keyed by rule id and the user's overrides; readProjectState (project-state.ts) and the desktop snapshot reader (packages/desktop/src/main/work.ts) pass it to readRepoSnapshot, so skillSetup is no longer null in the app. Null stays unknown: a repo that is not set up, or a setup with no valid verdict, disables nothing. Covered by compat.test.ts ('drops a broken rule's steps, and brings them back with an override', 'pre-types only installed skills when there is no verdict') and next-step.test.ts (broken, override, degraded). Known limit: readRepoSnapshot called directly with no skillSetup argument still yields null, by design.

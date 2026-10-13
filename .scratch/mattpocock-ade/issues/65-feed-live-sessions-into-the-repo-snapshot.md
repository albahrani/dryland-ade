# Feed live sessions into the repo snapshot

Type: task
Blocked by: 35, 36, 37, 38

## Question

Scope: readRepoSnapshot (packages/core/src/repo-snapshot.ts) leaves sessions null, so waiting-session and stale-claim never fire outside tests. Fill sessions from the live session list once the session tickets land. Keep null meaning unknown: null sessions must not make every claim stale. Acceptance: a claimed ticket with no live session yields stale-claim; a claimed ticket with a live session does not; a waiting session yields waiting-session. Split from 64.

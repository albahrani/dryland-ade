# Quit and shutdown lifecycle

Type: task
Status: ready-for-agent
Blocked by: 39

Spec: [spec](../spec.md), user stories 55, 56. "Lifecycle, packaging and release". ADRs 0002, 0004.

## What to build

Quitting leaves a consistent state. Quitting with live sessions shows a confirmation listing them, then kills them.

Quit and system shutdown share a hard 2-second budget, in this order: kill PTYs, release Dryland's own sessions' claims (local file operations only), flush UI state. Network-backed claim releases are never attempted at shutdown; the stale-claim flag covers them on next start.

## Acceptance criteria

- [ ] Quitting with live sessions shows a confirmation that lists them; cancelling keeps everything running
- [ ] Quitting with no live sessions asks nothing
- [ ] After quit, no PTY child process is left
- [ ] After quit, tickets claimed by Dryland's own sessions on local-markdown are released; claims made elsewhere are untouched
- [ ] On a GitHub or GitLab project, no network call is made at shutdown, and the claims show as possibly stale on next start
- [ ] The lifecycle module is tested with a fake PTY provider and a slow claim release: the order holds and the whole sequence finishes within 2 seconds, abandoning what does not fit
- [ ] UI state (open tabs, settings) survives the restart

# Cut the features that do not need the tracker

Type: task
Status: ready-for-agent
Blocked by: none

## Question

**What to build:** delete what the spec cuts and the tracker flip does not touch, so tickets 41 to 45 work on a smaller app. This is the cut half of old ticket 25; the session-state schema stays with ticket 25.

- [ ] Codex and Gemini adapters, their config and the auto-submit path are removed; only Claude Code and Copilot CLI adapters remain
- [ ] PTY output guessing, `statusApproximate`, `session.started` and hand-started adoption are removed
- [ ] The live-events panel, its IPC and its e2e spec are removed
- [ ] Hook-fed status still drives the session badges and the sessions view unchanged
- [ ] `ticket.changed` and the lock file stay: the state-ref watcher of ticket 42 replaces the first and ticket 45 removes both
- [ ] Tests, fixtures and docs of the removed paths are deleted

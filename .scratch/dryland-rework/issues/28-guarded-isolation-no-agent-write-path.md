# Guarded isolation: no agent write path

Type: task
Status: ready-for-agent
Blocked by: 26, 39

## Question

**What to build:** In Guarded mode agents can write tracker state only through dryland commands with a per-session token; bypasses are reverted and recorded as violations. A linked worktree can write the state ref today, so this builds on ticket 39's findings.

- [ ] Direct writes to state denied through the CLI's own rules and hooks
- [ ] Detected bypass reverted from the log, violation event recorded, agent told in the next result, second violation pauses the session
- [ ] Profile derived from ticket type; secrets scrubbed from env
- [ ] UI shows violations
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

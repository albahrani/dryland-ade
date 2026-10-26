# Session-state channel and adapter cuts

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** Hook-fed session states (running, waiting, idle, ended) drive badges, waiting counts, waiting-first ranking and the session index; the old live-events machinery and best-effort tier are removed.

- [ ] Schema session id, state, timestamp; unknown states rejected
- [ ] Removed: events panel, ticket.changed (the state-ref watcher from ticket 15 replaces it; the lock file goes with ticket 36, since markdown writes use it until then), hand-started adoption, session.started, output guessing, statusApproximate, best-effort tier, auto-submit
- [ ] doctor reports missing hooks as an error
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

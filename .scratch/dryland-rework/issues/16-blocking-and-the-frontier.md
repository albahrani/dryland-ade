# Blocking and the frontier

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** Blocking edges are kept acyclic and the engine computes the frontier; the UI shows frontier and blocked tickets.

- [ ] Cycles rejected
- [ ] Frontier lists open, unblocked, unclaimed tickets, lowest number first
- [ ] UI shows frontier and blocked views
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

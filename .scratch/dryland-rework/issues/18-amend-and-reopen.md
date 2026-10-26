# Amend and reopen

Type: task
Status: ready-for-agent
Blocked by: 17

## Question

**What to build:** Amend a resolved summary with a reason; reopen a resolved ticket with a reason, keeping the old summary as a superseded revision.

- [ ] Amend requires a reason and keeps the revision
- [ ] Reopen sets open, adds a correction entry and needs a new summary at next resolve
- [ ] Agents may reopen; the UI reopened badge persists until a human dismisses it
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

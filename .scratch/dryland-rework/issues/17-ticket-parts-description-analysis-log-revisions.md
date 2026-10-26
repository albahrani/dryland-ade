# Ticket parts: Description, Analysis log, revisions

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** A ticket has Report, Description (Problem, Cause, Plan), typed Analysis log and Solution summary; every edit is a revision with author kind.

- [ ] Description sections with one cap; resolve needs Problem and Plan (Cause for bugs)
- [ ] `ticket comment` is replaced by a typed log entry and needs the caller's claim
- [ ] Log entries typed finding, failed-attempt, correction, retraction; corrections point at an earlier entry with a reason; target never deleted
- [ ] ticket show, --log and --history behave as specified
- [ ] UI: log collapsed with count, retractions struck, History toggle with author kind, time and reason
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

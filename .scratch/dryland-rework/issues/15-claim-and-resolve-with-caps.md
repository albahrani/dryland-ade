# Claim and resolve with caps

Type: task
Status: ready-for-agent
Blocked by: 14

## Question

**What to build:** Claim before work, then resolve with a summary; over-cap or linted text is rejected with the limit stated. The UI shows status and summary.

- [ ] Claim sets claimed; the commands that change a ticket need the caller's claim (resolve here; log entries and description edits when ticket 17 adds them)
- [ ] The caller is identified by its session id from the environment; per-session tokens come with ticket 28
- [ ] Resolve needs a summary within caps; one resolve per session (research excepted)
- [ ] Over-cap text and lint hits (hedges, filler, paths, line numbers, bare ids) are rejected, never truncated; the title cap applies to `ticket create` too, which ticket 14 left uncapped
- [ ] UI shows status and solution summary
- [ ] The desktop refreshes when the state ref moves (watch the ref or poll its head), replacing the `ticket.changed` notice that ticket 25 removes
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

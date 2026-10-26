# Claim and resolve with caps

Type: task
Status: ready-for-agent
Blocked by: 14

## Question

**What to build:** Claim before work, then resolve with a summary; over-cap or linted text is rejected with the limit stated. The UI shows status and summary.

- [ ] Claim sets claimed; work commands need a claim
- [ ] Resolve needs a summary within caps; one resolve per session (research excepted)
- [ ] Over-cap text and lint hits (hedges, filler, paths, line numbers, bare ids) are rejected, never truncated
- [ ] UI shows status and solution summary
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

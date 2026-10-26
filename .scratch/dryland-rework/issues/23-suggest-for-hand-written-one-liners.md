# Suggest for hand-written one-liners

Type: task
Status: ready-for-agent
Blocked by: 21

## Question

**What to build:** A Suggest button beside hand-written one-liners runs a read-only agent prompt and fills a draft within the cap.

- [ ] Draft appears in resolve-by-hand, amend, and reopen or edit reason fields
- [ ] Saving counts as human-authored; no suggestion tracking
- [ ] Draft respects the cap
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

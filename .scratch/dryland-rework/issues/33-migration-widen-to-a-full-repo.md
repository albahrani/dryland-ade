# Migration: widen to a full repo

Type: task
Status: ready-for-agent
Blocked by: 32, 22

## Question

**What to build:** Migration covers forge-linked and plain feature tickets, research and prototype attachments, claims, over-cap shortening by workflow unslop, and removal of old skills.

- [ ] Per-row report with per-ticket diff and one-action revert
- [ ] Hash-matched shipped skills, skills-lock.json and tracker docs removed; differing skills become repo overrides
- [ ] Compat check runs and blocks finish only on bypass findings; reusable as doctor
- [ ] Repo workable right after finish
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

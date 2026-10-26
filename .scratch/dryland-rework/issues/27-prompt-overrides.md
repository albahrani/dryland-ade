# Prompt overrides

Type: task
Status: ready-for-agent
Blocked by: 26, 21

## Question

**What to build:** Global and repo overrides replace or append prompt text, ordered built-in, global, repo.

- [ ] Stale replacement flagged with a diff of built-in changes; appended text never flagged
- [ ] One customised-session badge with a dismissible warning that returns only when overrides change
- [ ] Engine gates apply regardless of prompts
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

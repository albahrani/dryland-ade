# Release notes and export

Type: task
Status: ready-for-agent
Blocked by: 18

## Question

**What to build:** A command collates solution summaries of tickets resolved in a range, grouped by type, with no rewriting; dryland export renders read-only markdown.

- [ ] Release notes output grouped by type
- [ ] Export is read-only and never a source
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

# Forge ingest and reporting

Type: task
Status: ready-for-agent
Blocked by: 24

## Question

**What to build:** GitHub and GitLab issues are ingested idempotently as human-authored Reports linked by URL into needs-triage; claim, resolve and reopen post progress back.

- [ ] Re-ingest creates no duplicates
- [ ] No two-way edits
- [ ] Forge tokens stay with the engine
- [ ] GitLab limits handled via glab api
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

# Forge ingest and reporting

Type: task
Status: ready-for-agent
Blocked by: 24

## Question

**What to build:** GitHub and GitLab issues are ingested idempotently as human-authored Reports linked by URL into needs-triage; claim, resolve and reopen post progress back.

- [ ] Ingest is new code on the engine; the old GitHub and GitLab tracker backends are gone after ticket 45
- [ ] Re-ingest creates no duplicates
- [ ] No two-way edits
- [ ] Forge tokens stay with the engine
- [ ] GitLab limits handled via glab api

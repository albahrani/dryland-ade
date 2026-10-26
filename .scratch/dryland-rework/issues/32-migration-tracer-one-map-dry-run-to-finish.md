# Migration tracer: one map, dry run to finish

Type: task
Status: ready-for-agent
Blocked by: 20, 24, 26

## Question

**What to build:** dryland migrate imports a repo with one map and a few tickets onto a dryland-migration branch and a local staging ref, with dry run, --finish and --abort.

- [ ] Dry-run preview
- [ ] Question to Report, Comments to finding entries, Answer to summary; originals kept as attachments
- [ ] Deterministic ids, idempotent resume
- [ ] --finish verifies counts and round-trip before merging the staging ref; --abort removes branch and ref
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

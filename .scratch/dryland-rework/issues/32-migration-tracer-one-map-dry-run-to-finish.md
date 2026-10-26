# Migration tracer: one map, dry run to finish

Type: task
Status: ready-for-agent
Blocked by: 20, 21, 24, 26

## Question

**What to build:** dryland migrate imports a repo with one map and a few tickets onto a dryland-migration branch and a local staging ref, with dry run, --finish and --abort.

- [ ] Dry-run preview
- [ ] Question to Report, Comments to finding entries, Answer to summary; originals kept as attachments
- [ ] Type, status, blocking, ticks, triage roles, Destination, Notes and fog carry over
- [ ] Deterministic ids, idempotent resume
- [ ] --finish verifies counts and round-trip before merging the staging ref; --abort removes branch and ref

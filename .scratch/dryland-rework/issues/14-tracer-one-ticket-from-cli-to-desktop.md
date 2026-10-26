# Tracer: one ticket from CLI to desktop

Type: task
Status: ready-for-agent
Blocked by: 13

## Question

**What to build:** dryland ticket create writes an event to the dedicated state ref, a disposable SQLite cache replays it, and the desktop app shows the ticket from the store. Lens mode and the .scratch file reader are removed on this path.

- [ ] create writes an immutable event on the never-checked-out ref
- [ ] ticket show reads the replayed state
- [ ] Desktop lists and opens the ticket from the store
- [ ] Old lens-mode reader, annotations and fingerprinting removed
- [ ] Deleting the cache rebuilds identical state
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

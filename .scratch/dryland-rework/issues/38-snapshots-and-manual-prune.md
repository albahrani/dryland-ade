# Snapshots and manual prune

Type: task
Status: ready-for-agent
Blocked by: 24

## Question

**What to build:** the two storage promises no ticket owns: periodic snapshots that bound replay, and a manual prune. Ticket 14 replays every event on each write and each cache rebuild, which will not scale. The cadence and the prune protocol across clones are set here, as ADR 0012 leaves them to the build.

- [ ] A snapshot bounds replay; replay from a snapshot gives the same state as a full replay
- [ ] Writes and cache rebuilds no longer read every event
- [ ] Prune is a manual command only; nothing prunes automatically
- [ ] A prune is safe across clones that share a state remote
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

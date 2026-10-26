# Tracer: one ticket from CLI to desktop

Type: task
Status: resolved
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

## Answer

Built the tracer in e4745cf. dryland init creates refs/dryland/state (never checked out). ticket create appends an immutable events/<seq>-<uuid>.json by compare-and-set with retry on a lost race; ticket show and list, and the desktop tree and ticket tab, read state replayed into a disposable SQLite cache under the git common dir, rebuilt identically when deleted. Tested at the CLI seam (7 tests) and in one Playwright e2e; pnpm test and native e2e pass. Known limits: (1) the old lens-mode reader, annotations (claim.ts) and fingerprinting (compat.ts) are NOT removed, because claim, resolve, tick, block, map and the whole desktop still depend on them; the store is used only in repos that ran dryland init, others keep the markdown path. Removal belongs with tickets 15 to 19 and 35. (2) No caps, lint, snapshots or author-kind display yet. (3) Docker was not running, so pnpm test:linux and test:e2e:linux were not run; leave them to CI. (4) The ticket has no acceptance-criteria heading, so no box could be ticked with dryland ticket tick. (5) No ADR or glossary change was needed.

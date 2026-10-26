# Tracer: one ticket from CLI to desktop

Type: task
Status: resolved
Blocked by: 13

## Question

**What to build:** dryland ticket create writes an event to the dedicated state ref, a disposable SQLite cache replays it, and the desktop app shows the ticket from the store. Removal of the old lens-mode reader, annotations and fingerprinting moved to ticket 45: it cannot happen before the other commands and the desktop run on the store.

- [x] create writes an immutable event on the never-checked-out ref
- [x] ticket show reads the replayed state
- [x] Desktop lists and opens the ticket from the store
- [x] Deleting the cache rebuilds identical state
- [x] ADRs and glossary amended in the same commit if this slice finds them wrong
- [x] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

## Answer

Built the tracer in e4745cf, fixed for Linux in the next commit. dryland init creates refs/dryland/state (never checked out). ticket create appends an immutable events/<seq>-<uuid>.json by compare-and-set with retry on a lost race; ticket show and list, and the desktop tree and ticket tab, read state replayed into a disposable SQLite cache under the git common dir, rebuilt identically when deleted. Tested at the CLI seam (7 tests) and one Playwright e2e. pnpm test, pnpm test:linux, native e2e and pnpm test:e2e:linux all pass. Known limits: (1) the old lens-mode reader, annotations (claim.ts) and fingerprinting (compat.ts) are NOT removed, because claim, resolve, tick, block, map and the whole desktop still depend on them; the store is used only in repos that ran dryland init, others keep the markdown path. That removal was dropped from this ticket and is now ticket 45. (2) No caps, lint, snapshots or author-kind display yet. (3) No ADR or glossary change was needed, but ticket 39 found that ADR 0012 and 0013 overstate the isolation of the state ref.

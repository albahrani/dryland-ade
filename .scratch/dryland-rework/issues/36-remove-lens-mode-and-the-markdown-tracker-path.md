# Remove lens mode and the markdown tracker path

Type: task
Status: ready-for-agent
Blocked by: 20, 21, 37

## Question

**What to build:** delete the old file-based tracker once every command and the desktop run on the state store. Split out of ticket 14, whose tracer could not delete code that claim, resolve, block, map and the desktop still used.

- [ ] Local-markdown, GitHub and GitLab tracker readers and writers removed, including the tracker-doc requirement and the "no store, so markdown" fallback in the CLI and core
- [ ] ADE-owned annotations (claim.ts) and fingerprinting (compat.ts) removed, with skill-setup state, the compatibility verdict and their dialogs and panels
- [ ] Lock file and tracker write path removed (ticket 25 no longer owns the lock file)
- [ ] The rule engine, efforts, repo snapshot and tickets tree read maps and tickets from the store; `.scratch` is read only for spec files
- [ ] `dryland init` creates the store and replaces the setup-matt-pocock-skills flow for a fresh repo
- [ ] Tests, fixtures and e2e specs of the removed paths deleted; lens-mode wording gone from docs
- [ ] This repo's own tracker is migrated or left as plain files, and AGENTS.md and the tracker doc say which
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass

# Delete the old tracker path

Type: task
Status: ready-for-agent
Blocked by: 44, 40

## Question

**Read first:** The Answers of tickets 40 to 44 and the porting list in ticket 41, ADR 0011, and `GLOSSARY.md` for the removed terms.

**What to build:** once every command and screen runs on the store, remove the file-based tracker and the per-repo dispatch. Replaces old ticket 36. This repo's own `.scratch` tracker is plain files outside Dryland and is not touched.

- [ ] Local-markdown, GitHub and GitLab tracker readers and writers are removed, with the tracker-doc requirement and the "no store, so markdown" branch in the CLI and core
- [ ] ADE-owned annotations (claim.ts), fingerprinting (compat.ts), skill-setup state, the compatibility verdict and their dialogs and panels are removed
- [ ] The lock file, `ticket.changed` and the tracker write path are removed
- [ ] A repo without a store gets an error that names `dryland init`
- [ ] `.scratch` is read only for spec files
- [ ] Tests, fixtures and e2e specs of the removed paths are deleted; lens-mode wording is gone from docs

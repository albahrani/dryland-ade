# Delete the old tracker path

Type: task
Status: resolved
Blocked by: 44, 40

## Question

**Read first:** The Answers of tickets 40 to 44 and the porting list in ticket 41, ADR 0011, and `GLOSSARY.md` for the removed terms.

**What to build:** once every command and screen runs on the store, remove the file-based tracker and the per-repo dispatch. Replaces old ticket 36. This repo's own `.scratch` tracker is plain files outside Dryland and is not touched.

- [x] Local-markdown, GitHub and GitLab tracker readers and writers are removed, with the tracker-doc requirement and the "no store, so markdown" branch in the CLI and core
- [x] ADE-owned annotations (claim.ts), fingerprinting (compat.ts), skill-setup state, the compatibility verdict and their dialogs and panels are removed
- [x] The lock file, `ticket.changed` and the tracker write path are removed
- [x] A repo without a store gets an error that names `dryland init`
- [x] `.scratch` is read only for spec files
- [x] Tests, fixtures and e2e specs of the removed paths are deleted; lens-mode wording is gone from docs

## Answer

Built in 0f15d53, 4d10e7b and the follow-ups up to 66d57f7. The local-markdown, GitHub and GitLab readers and writers, the tracker-doc requirement, `claim.ts`, `compat.ts`, `skill-setup.ts` and the skill mirror, the compatibility dialog, skill-setup panel and Settings tabs (Tracker, Skills), the auto-commit settings, `--commit` and `--no-commit` (now refused), `tracker-write.ts` and its `tracker.lock`, the live listener's `live.json` lock file (terminals reach the app only through `DRYLAND_PORT` and `DRYLAND_TOKEN`), the tracker widget and poller, `map index`, the `new-map` and `compat-check` work targets and `readTrackerKind` are gone. A repo without a store gets an error naming `dryland init` from every reader and writer, and a non-git or bare directory still gets its own error first. `.scratch` is read only for `spec.md` and watched for it. `ticket.changed` was already gone (ticket 25).

Decisions: the forge for pull and merge requests, which came from the tracker doc, now comes from the `origin` remote (`forgeOf(runner, cwd)`, GitHub and GitLab hosts), and `gh`/`glab` helpers moved to `forge-cli.ts`; a project with no such origin gets the local Merge section. `acquireLock`, `writeAtomically` and `defaultBranch` survived in `file-lock.ts` and `main-checkout.ts` (the session index uses them). `dryland doctor` replaces its tracker check with a `store` check. The next-step snapshot field `setupConfigPresent` is now `hasStore`. Docs: README, manual, changelog, glossary entry for ADE and the bug form lose the tracker wording. Tests of the removed paths and the `real-scratch` fixtures are deleted; the markdown fixtures of core, CLI, desktop unit and e2e tests now build store repos (`storeRepo`, `fixtureRepo`, `store-fixture.ts`).

Tests: `pnpm test` 706 passed, `pnpm test:linux` 712 passed, desktop e2e native 43 passed (the `start-work` spec after its fixes), `pnpm test:e2e:linux` 43 passed. Code review (Standards and Spec) run; fixed a stray edit spec and leftover skill-setup CSS.

Known limits: the Blocking-unknown state (`blockers: "unknown"`) and its rule outlived the backends that produced it; ADR 0010's title still says git common dir; `to-tickets` and `wayfinder` skills under `.agents/skills` still describe the tracker doc.

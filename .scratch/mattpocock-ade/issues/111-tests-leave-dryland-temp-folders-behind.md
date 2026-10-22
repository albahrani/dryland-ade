# Tests leave dryland-* temp folders behind

Type: task
Status: resolved

## Question

A Windows dev machine accumulated 69,357 dryland-* folders directly under %TEMP% since 2026-10-15, about 17 GB, and ran C: out of space (installed-launcher.test.ts failed with ENOSPC while implementing mattpocock-ade/94). Sampled sizes: dryland-e2e-user (1,983 folders, about 7 MB each, probably the Electron user-data dir of the Playwright tests, about 14 GB), dryland-test (18,188, about 100 KB), dryland-desktop-repo (10,606, about 90 KB), then dryland-work-bin, dryland-app, dryland-launcher, dryland-wt, dryland-e2e-work, dryland-settings, dryland-ui and others. Find every mkdtemp(...'dryland-...') in packages/*/test, packages/desktop/e2e and the helpers, and make each test remove its directory in afterEach/afterAll or a fixture (also when the test fails), starting with dryland-e2e-user. Done when a full pnpm test and the e2e run leave no new dryland-* folder in the OS temp directory; add a test or a check in the suite that fails if one is left. Do not delete other people's folders: the cleanup is the tests' own.

## Answer

Done in c991555. Instead of editing about 55 mkdtemp call sites, each run now scopes the OS temp directory: scopeTmp in packages/cli/test/scoped-tmp.ts creates one dryland-run-* folder and points TMPDIR, TEMP and TMP at it, so every tmpdir() in the tests and in the Electron apps they launch lands inside it. Vitest's global setup returns removeScopedTmp as its teardown; Playwright calls scopeTmp in playwright.config.ts and removes it in e2e/global-teardown.ts. Removal retries for a file Windows still holds. scoped-tmp.test.ts checks that the suite's own mkdtemp lands in the scoped folder and that scoping and removal work, so it fails if the scoping is dropped. Verified: pnpm test, the native e2e run, test:linux and test:e2e:linux pass; the native runs left the count of dryland-* folders in the real temp directory unchanged (34,605). Known limit: a run killed before its teardown leaves one dryland-run-* folder (with its contents), not thousands. Folders from before this change stay and need clearing by hand.

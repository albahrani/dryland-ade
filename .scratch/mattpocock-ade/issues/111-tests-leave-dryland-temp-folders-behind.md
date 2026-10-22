# Tests leave dryland-* temp folders behind

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T09:35:01.512Z","was":"ready-for-agent"}} -->

## Question

A Windows dev machine accumulated 69,357 dryland-* folders directly under %TEMP% since 2026-10-15, about 17 GB, and ran C: out of space (installed-launcher.test.ts failed with ENOSPC while implementing mattpocock-ade/94). Sampled sizes: dryland-e2e-user (1,983 folders, about 7 MB each, probably the Electron user-data dir of the Playwright tests, about 14 GB), dryland-test (18,188, about 100 KB), dryland-desktop-repo (10,606, about 90 KB), then dryland-work-bin, dryland-app, dryland-launcher, dryland-wt, dryland-e2e-work, dryland-settings, dryland-ui and others. Find every mkdtemp(...'dryland-...') in packages/*/test, packages/desktop/e2e and the helpers, and make each test remove its directory in afterEach/afterAll or a fixture (also when the test fails), starting with dryland-e2e-user. Done when a full pnpm test and the e2e run leave no new dryland-* folder in the OS temp directory; add a test or a check in the suite that fails if one is left. Do not delete other people's folders: the cleanup is the tests' own.

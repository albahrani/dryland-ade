# Diagnose the flaky parallel ticket create test

Type: task

## Question

`numbers N parallel creates consecutively without collisions` (packages/cli/test/ticket-create-resolve.test.ts) failed once in a full native Windows run on 2026-10-15, right after ticket 36's changes, which do not touch ticket creation. It then passed 5 full-suite runs and 12 isolated runs with 4 copies in parallel; the failure output was not kept. The test now reports each create's stderr and the git log on failure. When it fails again, use that output to find the cause (suspects: the 30 s tracker-lock or test timeout under load, git index.lock contention, or ticket numbering racing the lock) and fix it rather than retrying.

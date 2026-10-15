# Diagnose the flaky parallel ticket create test

Type: task
Status: resolved

## Question

`numbers N parallel creates consecutively without collisions` (packages/cli/test/ticket-create-resolve.test.ts) failed once in a full native Windows run on 2026-10-15, right after ticket 36's changes, which do not touch ticket creation. It then passed 5 full-suite runs and 12 isolated runs with 4 copies in parallel; the failure output was not kept. The test now reports each create's stderr and the git log on failure. When it fails again, use that output to find the cause (suspects: the 30 s tracker-lock or test timeout under load, git index.lock contention, or ticket numbering racing the lock) and fix it rather than retrying.

## Answer

Not flaky: a real race in the tracker lock, fixed in 8fa30fe. A temporary trace of acquires, releases and breaks caught it: a stale-lock breaker read the lock while its holder still had it; the holder released and exited, another writer linked a new lock, and the breaker, now seeing a dead holder, renamed that live lock away. Its restore (link back) lost to a third writer, so two writers held the lock and both allocated the same ticket number (the second commit then failed on git's index.lock, which is only a warning, so every create exited 0). Fix: breakers take turns through an exclusive `tracker.lock.break` file and re-read the lock during their turn, removing it only if it is still stale; readLock now separates missing (free), busy (held) and corrupt (crash debris); release retries a momentarily unreadable lock. Evidence: before the fix the full native suite failed in about 1 of 4 runs; after it, 0 of 12, and Linux passes. The test now reports each create's stderr and the git log on failure (ea60a57).

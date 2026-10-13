# Claim and release under a lock

Type: task
Status: resolved
Blocked by: 20

Spec: [spec](../spec.md), user stories 58 to 62. "Tracker write path". ADR 0001.

## What to build

The write path of the ADE tracker, proven with the two commands that matter most for parallel work: `dryland ticket claim <id>` and `dryland ticket release <id>`.

Writes go to the main checkout only, are atomic and are made under a lock. A claim records the holder (branch or session id) and a timestamp without changing the default ticket file format beyond what the skills already use. Every mutating command commits only its own tracker paths with a descriptive message. Auto-commit is on by default and can be turned off. If the commit fails, the change stays on disk and the CLI warns. If the main checkout is not on the default branch, the command warns.

This write machinery (lock, atomic write, pathspec commit, warnings) is what later mutating commands reuse.

## Acceptance criteria

- [x] N parallel `dryland ticket claim` processes against one repo produce exactly one winner; the losers exit non-zero and say who holds the claim
- [x] A claim made from a linked worktree changes the ticket in the main checkout
- [x] Each claim and release creates one commit that touches only tracker paths, even when other files in the main checkout are dirty or staged
- [x] With auto-commit turned off, the file changes and no commit is made
- [x] When the commit fails, the change is still on disk, the command warns and says what to do
- [x] When the main checkout is not on the default branch, the command warns
- [x] A crashed process does not leave the lock held forever
- [x] `ticket release` on a ticket that is not claimed exits non-zero with a clear message

## Answer

Implemented in 9c7900c, tidied in 609d934. `dryland ticket claim` and `ticket release` write to the main checkout only, atomically and under a lock, and commit only the ticket's own path (dirty or staged files are untouched). Auto-commit is on by default and off with `--no-commit` or git's `dryland.autoCommit`; a failed commit keeps the change on disk and warns; a main checkout off the default branch warns. Parallel claims have exactly one winner and the losers learn who holds it; a crashed or corrupt lock is not held forever; releasing an unclaimed ticket exits non-zero. Covered by `ticket-claim.test.ts`. This machinery is reused by every later mutating command.

# Claim and release under a lock

Type: task
Status: ready-for-agent
Blocked by: 20

Spec: [spec](../spec.md), user stories 58 to 62. "Tracker write path". ADR 0001.

## What to build

The write path of the ADE tracker, proven with the two commands that matter most for parallel work: `dryland ticket claim <id>` and `dryland ticket release <id>`.

Writes go to the main checkout only, are atomic and are made under a lock. A claim records the holder (branch or session id) and a timestamp without changing the default ticket file format beyond what the skills already use. Every mutating command commits only its own tracker paths with a descriptive message. Auto-commit is on by default and can be turned off. If the commit fails, the change stays on disk and the CLI warns. If the main checkout is not on the default branch, the command warns.

This write machinery (lock, atomic write, pathspec commit, warnings) is what later mutating commands reuse.

## Acceptance criteria

- [ ] N parallel `dryland ticket claim` processes against one repo produce exactly one winner; the losers exit non-zero and say who holds the claim
- [ ] A claim made from a linked worktree changes the ticket in the main checkout
- [ ] Each claim and release creates one commit that touches only tracker paths, even when other files in the main checkout are dirty or staged
- [ ] With auto-commit turned off, the file changes and no commit is made
- [ ] When the commit fails, the change is still on disk, the command warns and says what to do
- [ ] When the main checkout is not on the default branch, the command warns
- [ ] A crashed process does not leave the lock held forever
- [ ] `ticket release` on a ticket that is not claimed exits non-zero with a clear message

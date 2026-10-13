# Ticket create and resolve

Type: task
Status: resolved
Blocked by: 23

Spec: [spec](../spec.md), user stories 21, 25, 60. "CLI surface". ADRs 0001, 0008.

## What to build

`dryland ticket create` and `dryland ticket resolve`, on the write machinery from the claim ticket.

`ticket create` takes map, title, type, question and blocked-by, allocates the next ticket number under the lock, and writes a ticket file in the default skill format. `ticket resolve` appends the answer under `## Answer`, sets the ticket resolved and releases its claim. It writes straight to the main checkout and never deletes a worktree.

## Acceptance criteria

- [x] `ticket create` writes a file that the default skills can read and that `ticket show` round-trips
- [x] N parallel `ticket create` processes produce N tickets with distinct, consecutive numbers
- [x] `ticket resolve` records the answer and the resolved state, and a ticket that was blocked only by it now appears on the frontier
- [x] `ticket resolve` run from the ticket's worktree leaves that worktree and its branch in place
- [x] Both commands commit only their own tracker paths with a descriptive message
- [x] Creating a ticket for an unknown map, or resolving an unknown or already resolved ticket, exits non-zero and states the next action

## Answer

Implemented in f9d7db4, tidied in 8c25232. `dryland ticket create --map --title --type [--question] [--blocked-by]` allocates the next number under the lock and writes a default-format ticket that `ticket show` round-trips; parallel creates get distinct consecutive numbers. `ticket resolve --answer` fills `## Answer`, sets resolved and releases any claim, so a ticket blocked only by it reaches the frontier, and it leaves the worktree and branch in place. Both commit only their own paths; an unknown map, unknown or already resolved ticket, or unknown type exits non-zero with the next action. Unknown options are refused rather than ignored. Covered by `ticket-create-resolve.test.ts`.

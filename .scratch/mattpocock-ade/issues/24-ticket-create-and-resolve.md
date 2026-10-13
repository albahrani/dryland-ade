# Ticket create and resolve

Type: task
Status: ready-for-agent
Blocked by: 23

Spec: [spec](../spec.md), user stories 21, 25, 60. "CLI surface". ADRs 0001, 0008.

## What to build

`dryland ticket create` and `dryland ticket resolve`, on the write machinery from the claim ticket.

`ticket create` takes map, title, type, question and blocked-by, allocates the next ticket number under the lock, and writes a ticket file in the default skill format. `ticket resolve` appends the answer under `## Answer`, sets the ticket resolved and releases its claim. It writes straight to the main checkout and never deletes a worktree.

## Acceptance criteria

- [ ] `ticket create` writes a file that the default skills can read and that `ticket show` round-trips
- [ ] N parallel `ticket create` processes produce N tickets with distinct, consecutive numbers
- [ ] `ticket resolve` records the answer and the resolved state, and a ticket that was blocked only by it now appears on the frontier
- [ ] `ticket resolve` run from the ticket's worktree leaves that worktree and its branch in place
- [ ] Both commands commit only their own tracker paths with a descriptive message
- [ ] Creating a ticket for an unknown map, or resolving an unknown or already resolved ticket, exits non-zero and states the next action

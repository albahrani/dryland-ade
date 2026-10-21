# Decide whether created tickets enter the triage flow

Type: task
Status: ready-for-agent

Spec: [spec](../spec.md), user stories 21, 25. ADR 0008. Raised in review of [ticket 24](24-ticket-create-and-resolve.md).

## What to build

Decide what `dryland ticket create` writes for `Status:`, then make it so.

Today it writes no `Status:` line. The tracker reads that as open, so a created ticket appears in `ticket list` and, once unblocked, on `map frontier`. The default skills can read the file. But it carries no triage role, so it sits outside the triage flow until someone labels it.

The options:

- **No status (today).** Created tickets go straight onto the frontier. Simplest, and matches how wayfinder charts tickets.
- **`needs-triage`.** Created tickets wait for triage before an agent picks them up. This needs the role string from `docs/agents/triage-labels.md`, not a literal, and a decision on whether the frontier excludes `needs-triage` tickets.
- **A `--status` option** on `ticket create`, with the first behaviour as default.

Before choosing, check how the default skills (`to-tickets`, `wayfinder`, triage) treat a ticket with no `Status:` line, and which of them create tickets and with what status.

## Acceptance criteria

- [ ] The decision is recorded, with the reason, in this ticket's `## Answer` or in an ADR if it changes ADR 0008
- [ ] `ticket create` writes the agreed `Status:` (or none), using the repo's role string from the triage labels doc when it writes one
- [ ] A test pins the behaviour and the round-trip through `ticket show` still passes
- [ ] The new-ticket dialog's command preview (user story 21) matches what the command writes

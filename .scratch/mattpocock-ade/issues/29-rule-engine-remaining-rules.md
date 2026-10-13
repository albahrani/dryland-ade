# Rule engine: remaining rules

Type: task
Status: ready-for-agent
Blocked by: 28

Spec: [spec](../spec.md), user stories 29 to 31, 35 to 39. "Next-step rule engine". ADR 0007.

## What to build

Complete the rule engine.

New rules:

- a session waiting for input is a next step, ranked first
- a claim with no live Dryland session behind it is flagged "claimed, possibly stale" (a Stale claim); it is never auto-released
- `needs-triage` item: `/triage`
- spec with ready tickets: `/implement-spec`, or `/implement` per `ready-for-agent` ticket
- branch ahead and ticket done: `/pr` (with `/code-review` before)
- merged feature: `/retro`

Full priority order: waiting sessions, then possibly stale claims, then map frontier (lowest number first), then ready implementation work, then untriaged or unspecified work, then housekeeping (`/pr`, `/retro`).

Also: unknown backend facts are flagged ("blocking unknown"), never guessed; a "why not X?" query lists X's unresolved blockers; skills without a mechanical trigger are never recommended. The snapshot now carries coarse git state per Linked worktree (exists, ahead of default branch, merged, optional PR exists), live session state, and skill setup state with compatibility verdict.

## Acceptance criteria

- [ ] One fixture snapshot per new rule, asserting command, target, reason and evidence
- [ ] A fixture with one candidate of every priority class asserts the full order
- [ ] A ticket whose blockers are unknown is not put on the frontier and is flagged "blocking unknown"
- [ ] "Why not X?" for a blocked ticket lists exactly its unresolved blockers; for a ticket with unknown blockers it says so
- [ ] A stale claim produces a flag step and no step ever releases a claim
- [ ] No step recommends a skill outside the mechanically triggered set
- [ ] A rule disabled through the snapshot's compatibility verdict produces no steps, and an override re-enables it

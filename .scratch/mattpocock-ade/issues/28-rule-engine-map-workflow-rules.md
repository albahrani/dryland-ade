# Rule engine: map workflow rules

Type: task
Status: ready-for-agent
Blocked by: 22

Spec: [spec](../spec.md), user stories 26 to 28, 32 to 34, 38, 40. "Next-step rule engine". ADR 0007.

## What to build

The next-step rule engine as a pure function in core: a repo snapshot in, a ranked list of next steps out. Each next step carries a target artifact, a recommended skill command, a rule id, a one-sentence reason and an evidence list (which artifact and field was read).

This ticket defines the snapshot shape (normalized tickets and maps, presence of spec/ADR/glossary files, and placeholders for git state, live session state and skill setup state that later rules fill) and implements the first rules:

- no setup config: `/setup-matt-pocock-skills`
- map with a frontier ticket: `/wayfinder <map>` naming the ticket, lowest number first
- cleared map (no open child tickets, no fog): `/to-spec <map>`
- map with only fog remaining: the next step targets the map itself
- spec without tickets: `/to-tickets`

Rules are ordered in code. No LLM, no user-editable rules. The prototype's snapshot generator shows the intended snapshot shape; it is a reference, not code to reuse.

## Acceptance criteria

- [ ] One fixture snapshot per rule, asserting the recommended command, the target, the reason text and the evidence
- [ ] The same snapshot always produces the same ranked list
- [ ] With several maps that each have a frontier ticket, steps are ordered lowest ticket number first within a map
- [ ] A map with fog but no open tickets yields a step whose target is the map
- [ ] A snapshot built from this repo's real `.scratch` state yields `/to-tickets` for the spec
- [ ] The engine function has no I/O and no Electron imports

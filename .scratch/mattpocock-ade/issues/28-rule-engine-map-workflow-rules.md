# Rule engine: map workflow rules

Type: task
Status: resolved
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

- [x] One fixture snapshot per rule, asserting the recommended command, the target, the reason text and the evidence
- [x] The same snapshot always produces the same ranked list
- [x] With several maps that each have a frontier ticket, steps are ordered lowest ticket number first within a map
- [x] A map with fog but no open tickets yields a step whose target is the map
- [x] A snapshot built from this repo's real `.scratch` state yields `/to-tickets` for the spec
- [x] The engine function has no I/O and no Electron imports

## Answer

Built the next-step rule engine in packages/core: next-step.ts (pure nextSteps(snapshot), RepoSnapshot/NextStep/Evidence types) and repo-snapshot.ts (readRepoSnapshot, the I/O side kept out of the engine). Commits c44200d and 3108152. Rules, in order: no-setup-config, map-frontier (one step per frontier ticket, map then lowest number first, command /wayfinder <map>, ticket in target/reason), map-fog-only (targets the map), map-cleared (/to-spec), spec-without-tickets (/to-tickets). Decisions: a ticket counts as a slice of the spec when it carries a triage role, or is a task in an effort with a spec and no '## Question' section; wayfinding rules ignore slices. map-cleared needs at least one resolved ticket and no spec. Real-state criterion is tested from fixtures tickets 01-19 plus a stub spec, since the live state has slices. Known limits: no-I/O is by inspection plus the existing core Electron lint rule, not a test; git, sessions and skill-setup snapshot fields are null placeholders; triage, stale-claim, implement, pr and retro rules are later tickets (29).

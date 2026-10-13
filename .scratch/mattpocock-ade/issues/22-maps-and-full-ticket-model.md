# Maps and the full ticket model

Type: task
Status: resolved
Blocked by: 20

Spec: [spec](../spec.md), user stories 12, 16, 17, 25, 66. "Normalized ticket model". ADR 0008.

## What to build

Complete the read side of the local-markdown tracker. `dryland ticket show <id>`, `dryland map show <map>` and `dryland map frontier <map>` work, and `ticket list` gains the remaining fields.

The normalized ticket model carries: id, title, type (research, prototype, grilling, task, or none), state (open, claimed, resolved), claimant, blockers (a known list, or unknown), parent map, triage role, body, answer, comments, and an opaque `raw` field. Triage role strings come from `docs/agents/triage-labels.md`. Ticket kind (Fog, Planning, Implementation) is derived, never stored. A map is parsed into its sections, including the fog (not-yet-specified items) and Decisions-so-far.

The frontier is the open, unblocked, unclaimed tickets of a map, lowest number first. Parsers tolerate `<!-- dryland: ... -->` annotations and specs without tickets are detectable (needed later by the rule engine).

## Acceptance criteria

- [x] `ticket show` prints a ticket's fields including blockers, answer and comments; `--json` returns the normalized model
- [x] `map show` prints a map's tickets grouped by ticket kind, with its fog items
- [x] `map frontier` returns only open, unblocked, unclaimed tickets, lowest number first; a ticket is unblocked when every ticket it lists is resolved
- [x] Ticket kind is derived from type and map fog and is not written anywhere
- [x] A ticket or map containing a `<!-- dryland: ... -->` annotation parses to the same result as without it
- [x] Parsers are tested with this repo's real map and tickets as fixtures
- [x] No command in this ticket writes to the repo

## Answer

Implemented in de80538, tidied in 4154e21. `dryland ticket show`, `map show` and `map frontier` read the full normalized ticket model (type, state, claimant, blockers as a list or unknown, triage role from `docs/agents/triage-labels.md`, body, answer, comments) and parse maps into tickets grouped by derived kind, fog and Decisions-so-far. The frontier is open, unblocked, unclaimed tickets, lowest number first. `<!-- dryland: ... -->` annotations parse identically, and none of these commands writes (asserted by a no-write test). Covered by `ticket-model.test.ts`, including this repo's real map and tickets as fixtures; specs without tickets are detectable via `findSpecsWithoutTickets`.

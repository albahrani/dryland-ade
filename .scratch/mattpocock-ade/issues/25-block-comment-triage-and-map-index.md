# Block, comment, triage and map index

Type: task
Status: resolved
Blocked by: 23

Spec: [spec](../spec.md), user stories 60, 66, 67. "CLI surface". ADRs 0001, 0008.

## What to build

The remaining mutating tracker commands, on the write machinery from the claim ticket:

- `dryland ticket block` to add and remove blockers
- `dryland ticket comment` to append under `## Comments`
- named `ticket` subcommands for triage and label changes, using the role strings from `docs/agents/triage-labels.md`
- `dryland map index` to append a context pointer (gist plus link) to a map's Decisions-so-far

These are the only map and ticket edits Dryland makes. Skill-authored prose in the map body (Notes, fog) is never altered.

## Acceptance criteria

- [x] Adding a blocker removes the ticket from the frontier; removing it puts it back
- [x] A comment is appended under `## Comments`, creating the heading if needed, and earlier comments are untouched
- [x] A triage change writes the role string defined in the repo's triage labels doc, and an unknown role is rejected with the valid ones listed
- [x] `map index` appends one entry to Decisions-so-far and leaves every other line of the map byte-identical
- [x] Each command commits only its own tracker paths with a descriptive message
- [x] Failures exit non-zero and state the next action

## Answer

Implemented in 0b6dc8a, tidied in 31e6463 and c0b3138. `ticket block --add/--remove`, `ticket comment --text`, `ticket triage --role` (canonical role or the repo's label; writes the label from the triage labels doc; unknown roles list the valid ones) and `map index --title --link --gist`, all on the claim ticket's write machinery: one commit per command covering only its own path, failures exit non-zero with a Next: line. Each line of an edited file keeps its own line ending. Decision: `map index` replaces a bare `Nothing.`/`None.` placeholder in Decisions-so-far with the first entry, because the map parser reads a leading Nothing as no items and would otherwise ignore it; every other line stays byte-identical.

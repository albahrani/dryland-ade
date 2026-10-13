# Block, comment, triage and map index

Type: task
Status: ready-for-agent
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

- [ ] Adding a blocker removes the ticket from the frontier; removing it puts it back
- [ ] A comment is appended under `## Comments`, creating the heading if needed, and earlier comments are untouched
- [ ] A triage change writes the role string defined in the repo's triage labels doc, and an unknown role is rejected with the valid ones listed
- [ ] `map index` appends one entry to Decisions-so-far and leaves every other line of the map byte-identical
- [ ] Each command commits only its own tracker paths with a descriptive message
- [ ] Failures exit non-zero and state the next action

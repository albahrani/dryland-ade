# GitHub backend: writes

Type: task
Status: ready-for-agent
Blocked by: 24, 25, 45

Spec: [spec](../spec.md), user stories 58, 67, 70. "Tracker write path", "CLI surface". ADRs 0001, 0008.

## What to build

The write side of the GitHub tracker backend, so that every mutating `ticket` and `map` command works on a GitHub repo through `gh`: create, claim, release, resolve, block, comment, the triage subcommands and `map index`.

Mapping: claim and release set and clear the assignee; resolve posts the answer and closes the issue; blocking sets native dependencies; comments are issue comments; triage changes are label changes; `map index` edits the map issue's body. No local commit is made for these writes. Emitting `ticket.changed` belongs to the shared command layer (live reporting ticket), not to a backend, so nothing backend-specific is needed for it.

Tested against recorded `gh` fixtures through the process-runner interface.

## Acceptance criteria

- [ ] Each mutating command issues the expected `gh` calls against recorded fixtures and reports success in the same plain-text and `--json` form as on local-markdown
- [ ] Claiming an issue that already has another assignee fails with a non-zero exit and names the holder
- [ ] `ticket create` under a map makes the new issue a sub-issue of the map issue
- [ ] `map index` changes only the Decisions-so-far part of the map issue's body
- [ ] A failed `gh` call is reported with the next action, and no partial success is claimed
- [ ] No local commit is created for GitHub writes

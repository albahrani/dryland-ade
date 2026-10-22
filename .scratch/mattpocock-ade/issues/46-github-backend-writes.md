# GitHub backend: writes

Type: task
Status: resolved
Blocked by: 24, 25, 45

Spec: [spec](../spec.md), user stories 58, 67, 70. "Tracker write path", "CLI surface". ADRs 0001, 0008.

## What to build

The write side of the GitHub tracker backend, so that every mutating `ticket` and `map` command works on a GitHub repo through `gh`: create, claim, release, resolve, block, comment, the triage subcommands and `map index`.

Mapping: claim and release set and clear the assignee; resolve posts the answer and closes the issue; blocking sets native dependencies; comments are issue comments; triage changes are label changes; `map index` edits the map issue's body. No local commit is made for these writes. Emitting `ticket.changed` belongs to the shared command layer (live reporting ticket), not to a backend, so nothing backend-specific is needed for it.

Tested against recorded `gh` fixtures through the process-runner interface.

## Acceptance criteria

- [x] Each mutating command issues the expected `gh` calls against recorded fixtures and reports success in the same plain-text and `--json` form as on local-markdown
- [x] Claiming an issue that already has another assignee fails with a non-zero exit and names the holder
- [x] `ticket create` under a map makes the new issue a sub-issue of the map issue
- [x] `map index` changes only the Decisions-so-far part of the map issue's body
- [x] A failed `gh` call is reported with the next action, and no partial success is claimed
- [x] No local commit is created for GitHub writes

## Answer

Implemented in a96dc7a and ed7001e. New core/github-write.ts; every local write function (create, claim, release, resolve, block, comment, triage, map index) checks githubCheckout and routes to it on a GitHub tracker, so the CLI and app work unchanged, no local commit is made. Mapping: claim assigns the user's gh login (the branch holder is not used) and backs out if another assignee landed first; release clears the assignees; resolve writes ## Answer into the issue body (where the read side finds it) and closes it in one PATCH; block uses the dependencies API with issue ids; comments are issue comments; triage adds the role label and removes other role labels; create posts the issue with a type:<type> label, links it as a sub-issue and sets blockers, naming the created issue if a later step fails; map index appends to Decisions-so-far in the map issue body keeping its line endings. Failed gh calls give the next action. Tested against a fake gh in core/test/github-write.test.ts. Known limits: GitHub claims record no timestamp; block and triage make several calls, so a mid-way failure can leave them half applied (the error is thrown, no success claimed); release clears assignees without checking who holds them; the claim race check relies on GitHub listing the first assignee first; resolve leaves the assignee set; GitLab still refuses writes; the glossary's Claim entry still describes the branch holder only.

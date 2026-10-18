# GitHub backend: read

Type: task
Status: resolved
Blocked by: 22

Spec: [spec](../spec.md), user stories 8, 17, 70. "Tracker write path", "Normalized ticket model". ADRs 0001, 0008.

## What to build

The read side of the GitHub tracker backend. In a repo whose `docs/agents/issue-tracker.md` selects GitHub, `dryland ticket list`, `ticket show`, `map show` and `map frontier` return the same normalized model as on local-markdown, fetched through the user's `gh` login.

Mapping: the claim is the assignee; blocking uses GitHub's native dependencies; the map is an issue whose body is the map index, with child tickets as its sub-issues; triage roles are labels. Backend extras go into the opaque `raw` field.

`gh` is reached only through the process-runner interface and tested against recorded `gh` JSON fixtures. No live network in CI. Missing or unauthenticated `gh` is reported clearly. Tokens are never requested or stored.

## Acceptance criteria

- [x] With recorded fixtures, `ticket list`, `ticket show`, `map show` and `map frontier` return normalized tickets with state, claimant, blockers, parent map and triage role
- [x] An assigned issue is reported as claimed with the assignee as claimant
- [x] Blockers come from native dependencies; when they cannot be determined they are reported as unknown, not as empty
- [x] Missing `gh` and logged-out `gh` each produce a non-zero exit and a message stating the next action
- [x] No code path reads, asks for or stores a token
- [x] The rule engine fixtures pass unchanged with tickets coming from this backend
- [x] Tests run without network access

## Answer

Implemented in a2297e0. New core/github-backend.ts reads maps and tickets through gh via the process runner; tickets.ts routes the github tracker kind to it, so ticket list/show and map show/frontier work unchanged. Mapping: a map is an issue labelled `map` (named by its issue number) whose body is the map index and whose sub-issues are its tickets; ticket ids are issue numbers; type is a `type:<type>` label; closed is resolved, an assignee is claimed (first assignee is the claimant); blockers come from the dependencies/blocked_by API and are "unknown" when that call fails; triage role is a label via the triage vocabulary; answer is the body's ## Answer section; comments come from the comments API. Missing gh and logged-out gh each fail with a next action; no token is read, asked for or stored. Tested on recorded gh JSON (core/test/github-backend.test.ts), including that nextSteps gives the same steps for GitHub and local tickets. Known limits: a failed comments fetch shows no comments; maps are capped at 1000; specsWithoutTickets returns none for GitHub; no doctor change; GitLab still unsupported; write commands remain local-markdown only.

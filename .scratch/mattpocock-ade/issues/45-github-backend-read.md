# GitHub backend: read

Type: task
Status: ready-for-agent
Blocked by: 22

Spec: [spec](../spec.md), user stories 8, 17, 70. "Tracker write path", "Normalized ticket model". ADRs 0001, 0008.

## What to build

The read side of the GitHub tracker backend. In a repo whose `docs/agents/issue-tracker.md` selects GitHub, `dryland ticket list`, `ticket show`, `map show` and `map frontier` return the same normalized model as on local-markdown, fetched through the user's `gh` login.

Mapping: the claim is the assignee; blocking uses GitHub's native dependencies; the map is an issue whose body is the map index, with child tickets as its sub-issues; triage roles are labels. Backend extras go into the opaque `raw` field.

`gh` is reached only through the process-runner interface and tested against recorded `gh` JSON fixtures. No live network in CI. Missing or unauthenticated `gh` is reported clearly. Tokens are never requested or stored.

## Acceptance criteria

- [ ] With recorded fixtures, `ticket list`, `ticket show`, `map show` and `map frontier` return normalized tickets with state, claimant, blockers, parent map and triage role
- [ ] An assigned issue is reported as claimed with the assignee as claimant
- [ ] Blockers come from native dependencies; when they cannot be determined they are reported as unknown, not as empty
- [ ] Missing `gh` and logged-out `gh` each produce a non-zero exit and a message stating the next action
- [ ] No code path reads, asks for or stores a token
- [ ] The rule engine fixtures pass unchanged with tickets coming from this backend
- [ ] Tests run without network access

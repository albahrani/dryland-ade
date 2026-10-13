# GitLab backend

Type: task
Status: ready-for-agent
Blocked by: 46

Spec: [spec](../spec.md), user stories 17, 70. "Tracker write path". ADRs 0001, 0008.

## What to build

The GitLab tracker backend through the user's `glab` login, read and write, following the shape of the GitHub backend: every `ticket` and `map` command works on a repo whose tracker doc selects GitLab.

Mapping: claim is the assignee, the map index is the map issue's body, triage roles are labels. Blocking uses native dependencies where available. GitLab without Premium keeps blocking in a `Blocked by:` line in the issue body, which `dryland` reads and writes. When neither source can say, blockers are unknown.

Tested against recorded `glab` JSON fixtures through the process-runner interface. Missing or unauthenticated `glab` is reported clearly; tokens are never requested or stored.

## Acceptance criteria

- [ ] With recorded fixtures, all read commands return normalized tickets and all mutating commands issue the expected `glab` calls
- [ ] On a Premium fixture, blockers come from native dependencies
- [ ] On a non-Premium fixture, `ticket block` writes a `Blocked by:` body line and the read side reports those blockers
- [ ] On a non-Premium fixture with no body line and no way to tell, blockers are reported as unknown
- [ ] Missing `glab` and logged-out `glab` each produce a non-zero exit and a message stating the next action
- [ ] Tests run without network access

## Comments

From the review of 30: an open ticket whose blockers are 'unknown' is shown as status 'blocked' (consistent with the frontier rule, but story 17 says Dryland never guesses). Only GitLab without Premium produces 'unknown'; decide here, with real data, whether it needs a neutral status or stays blocked, and update the legend and the 'blocked' meaning in GLOSSARY.md (Ticket status) accordingly.

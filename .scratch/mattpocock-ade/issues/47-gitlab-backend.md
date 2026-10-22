# GitLab backend

Type: task
Status: resolved
Blocked by: 46

Spec: [spec](../spec.md), user stories 17, 70. "Tracker write path". ADRs 0001, 0008.

## What to build

The GitLab tracker backend through the user's `glab` login, read and write, following the shape of the GitHub backend: every `ticket` and `map` command works on a repo whose tracker doc selects GitLab.

Mapping: claim is the assignee, the map index is the map issue's body, triage roles are labels. Blocking uses native dependencies where available. GitLab without Premium keeps blocking in a `Blocked by:` line in the issue body, which `dryland` reads and writes. When neither source can say, blockers are unknown.

Tested against recorded `glab` JSON fixtures through the process-runner interface. Missing or unauthenticated `glab` is reported clearly; tokens are never requested or stored.

## Acceptance criteria

- [x] With recorded fixtures, all read commands return normalized tickets and all mutating commands issue the expected `glab` calls
- [x] On a Premium fixture, blockers come from native dependencies
- [x] On a non-Premium fixture, `ticket block` writes a `Blocked by:` body line and the read side reports those blockers
- [x] On a non-Premium fixture with no body line and no way to tell, blockers are reported as unknown
- [x] Missing `glab` and logged-out `glab` each produce a non-zero exit and a message stating the next action
- [x] Tests run without network access

## Comments

From the review of 30: an open ticket whose blockers are 'unknown' is shown as status 'blocked' (consistent with the frontier rule, but story 17 says Dryland never guesses). Only GitLab without Premium produces 'unknown'; decide here, with real data, whether it needs a neutral status or stays blocked, and update the legend and the 'blocked' meaning in GLOSSARY.md (Ticket status) accordingly.

## Answer

Implemented in dbfd998 and the commit after it. New core/gitlab-backend.ts (read) and gitlab-write.ts (write) over `glab api`; a RemoteBackend seam in tracker-backend.ts now routes every write to GitHub or GitLab (partly ticket 99), and shared triage-role and blocker checks moved to tracker-rules.ts. Mapping: claim is the assignee (user's own glab login); map is an issue labelled map, its tickets carry the label map:<n>, type is type:<t>; triage is one add_labels/remove_labels PUT; resolve writes ## Answer and closes in one PUT; map index edits the map issue body. Blockers: Premium (namespace plan premium/ultimate) uses is_blocked_by issue links, falling back to the body line if links cannot be read; otherwise a Blocked by: body line, written by ticket block and by ticket create (Blocked by: none), and unknown when a hand-made issue has no line. Decision on the review comment: unknown stays 'blocked' (never offer a ticket on a guess); GLOSSARY Ticket status updated; no legend change. Tests: core/test/gitlab-backend.test.ts with a fake glab, no network. Known limits: Premium is detected from namespaces/:id plan, which GitLab shows only to owners, so a member of a Premium group is treated as free and uses body lines; link matching uses iid only, ignoring links to other projects; assignees beyond the first are ignored and claim overwrites them, with no race check; commentsOf hides a failed notes call as no comments; glab flags (assignee_ids[], :id placeholder, -f arrays) are unverified against a real glab and project, so a real-repo check like ticket 102 is still needed; release on GitLab refuses another user's claim, unlike GitHub (ticket 101).

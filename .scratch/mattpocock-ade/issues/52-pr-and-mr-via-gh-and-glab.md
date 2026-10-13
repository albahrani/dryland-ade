# PR/MR via `gh` and `glab`

Type: task
Status: ready-for-agent
Blocked by: 46, 47, 51

Spec: [spec](../spec.md), user stories 37, 76. "Next-step rule engine" (housekeeping). Layout detail: `prototype/views-and-ux/` (Merge/PR).

## What to build

On GitHub and GitLab projects, the Merge/PR section opens a pull request or merge request through the user's `gh`/`glab` login instead of merging locally. The same dry-run checks apply first.

The user chooses between two paths: open the PR/MR directly, or start a session with `/pr` pre-typed so the skill writes it. Once a PR/MR exists for a worktree branch, the section shows its state and a link, and that fact feeds the rule engine snapshot so `/pr` is no longer recommended and `/retro` is recommended after the merge.

## Acceptance criteria

- [ ] On a GitHub project the section offers "Open PR"; on GitLab "Open MR"; on local-markdown neither
- [ ] Opening a PR/MR pushes the branch and creates it through `gh`/`glab`, tested with a fake process runner
- [ ] The `/pr` path opens the ticket's session with `/pr` typed and not submitted
- [ ] An existing PR/MR is shown with state and link instead of the open action
- [ ] A finished ticket with a branch ahead gets `/pr` as next step; once the feature is merged it gets `/retro`
- [ ] Missing or logged-out `gh`/`glab` is reported with the next action

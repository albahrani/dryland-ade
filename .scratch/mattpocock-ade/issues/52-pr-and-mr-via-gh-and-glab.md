# PR/MR via `gh` and `glab`

Type: task
Status: resolved
Blocked by: 46, 47, 51

Spec: [spec](../spec.md), user stories 37, 76. "Next-step rule engine" (housekeeping). Layout detail: `prototype/views-and-ux/` (Merge/PR).

## What to build

On GitHub and GitLab projects, the Merge/PR section opens a pull request or merge request through the user's `gh`/`glab` login instead of merging locally. The same dry-run checks apply first.

The user chooses between two paths: open the PR/MR directly, or start a session with `/pr` pre-typed so the skill writes it. Once a PR/MR exists for a worktree branch, the section shows its state and a link, and that fact feeds the rule engine snapshot so `/pr` is no longer recommended and `/retro` is recommended after the merge.

## Acceptance criteria

- [x] On a GitHub project the section offers "Open PR"; on GitLab "Open MR"; on local-markdown neither
- [x] Opening a PR/MR pushes the branch and creates it through `gh`/`glab`, tested with a fake process runner
- [ ] The `/pr` path opens the ticket's session with `/pr` typed and not submitted
- [x] An existing PR/MR is shown with state and link instead of the open action
- [x] A finished ticket with a branch ahead gets `/pr` as next step; once the feature is merged it gets `/retro`
- [x] Missing or logged-out `gh`/`glab` is reported with the next action

## Answer

Built in 3be5c5b and ed7d942. Core: pull-request.ts (findPullRequest, openPullRequest, forgeOf, pullRequestBlockers) via gh/glab, tested with a fake runner; open checks the CLI first, applies the dry run (minus the main-checkout blockers, since nothing merges there), pushes origin/<branch>, creates, reads back. repo-snapshot now feeds prExists/merged from the forge, so /pr stops and /retro follows a merged PR. Desktop: PullRequestPanel in Source Control on GitHub/GitLab trackers (Open PR/MR, or Start session with /pr via startWork skill 'pr', both gated by the dry run; existing PR shows state and link; gh/glab errors shown with next action). Also passed the runner into readTickets in worktree/merge. Known limits: the /pr pre-typed-not-submitted behaviour rests on the existing startWork path and auto-submit setting, not a new test (criterion left unticked); remote is hardcoded to origin; squash-merged PRs on branches no longer ahead are not seen; the forge is asked on every pane refresh.

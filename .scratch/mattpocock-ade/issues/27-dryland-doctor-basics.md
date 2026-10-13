# `dryland doctor` basics

Type: task
Status: resolved
Blocked by: 20

Spec: [spec](../spec.md), user stories 69, 88. "CLI surface". ADR 0008.

## What to build

`dryland doctor` checks the things a user can fix themselves and says what is missing:

- setup: are the skills and the `docs/agents` files present
- tracker: which tracker the repo uses, whether it is the ADE tracker, and for GitHub/GitLab whether `gh`/`glab` is installed and logged in
- `PATH`: whether `dryland` is reachable on `PATH`

The hooks check and the user-config install/status/remove come with the Copilot CLI adapter ticket; `--compat-prompt` comes with the compatibility ticket.

## Acceptance criteria

- [x] In a healthy default repo, `doctor` reports every check as OK and exits 0
- [x] Each failing check names what is missing and the next action; the command exits non-zero
- [x] A repo without the skills set up is reported with `/setup-matt-pocock-skills` as the next action
- [x] A GitHub or GitLab repo with `gh`/`glab` missing or logged out is reported clearly, without asking for a token (tested by faking the process runner)
- [x] `--json` returns the checks as structured data

## Answer

Implemented in 56e8094 and tightened in 13dd435. `dryland doctor [--json]` runs three checks: setup (a SKILL.md under .claude/skills or .agents/skills, plus docs/agents triage-labels.md and domain.md), tracker (the tracker doc is present and supported; for GitHub/GitLab `gh`/`glab` is installed and logged in, never asking for a token) and PATH (a runnable dryland: a regular file with the x bit, or a PATHEXT extension on Windows). Each failing check names the next action and the command exits 1; outside a git repo it still reports all three. Decisions: a missing issue-tracker.md is reported once, under tracker; the process runner is faked for gh/glab in core tests. Known limits: `gh auth status` is non-zero if any configured host has a problem, so it can read as logged out; the CLI has no end-to-end test for the GitHub/GitLab path; hooks and user-config checks and --compat-prompt stay with their own tickets.

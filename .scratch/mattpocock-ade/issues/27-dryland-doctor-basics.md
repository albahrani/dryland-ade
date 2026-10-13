# `dryland doctor` basics

Type: task
Status: ready-for-agent
Blocked by: 20

Spec: [spec](../spec.md), user stories 69, 88. "CLI surface". ADR 0008.

## What to build

`dryland doctor` checks the things a user can fix themselves and says what is missing:

- setup: are the skills and the `docs/agents` files present
- tracker: which tracker the repo uses, whether it is the ADE tracker, and for GitHub/GitLab whether `gh`/`glab` is installed and logged in
- `PATH`: whether `dryland` is reachable on `PATH`

The hooks check and the user-config install/status/remove come with the Copilot CLI adapter ticket; `--compat-prompt` comes with the compatibility ticket.

## Acceptance criteria

- [ ] In a healthy default repo, `doctor` reports every check as OK and exits 0
- [ ] Each failing check names what is missing and the next action; the command exits non-zero
- [ ] A repo without the skills set up is reported with `/setup-matt-pocock-skills` as the next action
- [ ] A GitHub or GitLab repo with `gh`/`glab` missing or logged out is reported clearly, without asking for a token (tested by faking the process runner)
- [ ] `--json` returns the checks as structured data

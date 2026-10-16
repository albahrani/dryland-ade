# v1.0.0 smoke checklist

Type: task
Status: ready-for-human
Blocked by: 34, 38, 40, 41, 42, 48, 52, 56, 58, 60

Spec: [spec](../spec.md), "Testing Decisions" (manual smoke checklist), "Further Notes" (risks). ADR 0004.

## What to build

The manual gate before `v1.0.0` goes to the `latest` channel. Nothing is built; a human runs the checklist on Windows against real services and real Agent CLIs, files a ticket for anything that fails, and tags the release when all of it passes.

One risk carried from the spec is closed here:

- The Copilot CLI adapter was built from recorded shapes on a machine without Copilot. Re-check it on a machine that has Copilot CLI, on its current version.

## Acceptance criteria

- [ ] A real GitHub project works end to end: list, claim, resolve, blocking, polling, open PR
- [ ] A real GitLab project works end to end, including blocking without Premium
- [ ] Claude Code: start work, pre-typed unsubmitted command, interactive trust prompt, all five session states
- [ ] Copilot CLI on a machine that has it: hook install and remove, no trust prompt in a Dryland worktree, all five session states, hook inert outside Dryland
- [ ] Install and uninstall on Windows, including the global `PATH` option
- [ ] Auto-update from a `beta` build to `latest`, applied on quit
- [ ] Quit with live sessions: confirmation, no leftover processes, every claim kept and the sessions paused (ADR 0010)
- [ ] Every failure has a ticket, and all are resolved
- [ ] `v1.0.0` is tagged and published to `latest`

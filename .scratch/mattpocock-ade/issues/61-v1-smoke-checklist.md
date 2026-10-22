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
- [ ] Copilot CLI assumptions built from recorded shapes (ticket 43), each confirmed or fixed on the current version:
  - the lock file beside `config.json` is really named `config.json.trusted-folders.lock`, and Copilot honours a lock Dryland holds
  - the hook payload's session id key is `sessionId`, and `COPILOT_AGENT_SESSION_ID` is set for hooks
  - the `powershell` hook command `$input | dryland agent-hook ...` receives the payload on stdin and finishes inside `timeoutSec`
  - `--session-id <uuid>` is accepted at launch, `--resume=<id>` resumes that session, and a bare `--resume` opens the picker
  - the folder trust dialog is matched by the adapter's blocking prompts, so nothing is pre-typed into it
- [ ] Install and uninstall on Windows, including the global `PATH` option
- [ ] Auto-update from a `beta` build to `latest`, applied on quit
- [ ] Quit with live sessions: confirmation, no leftover processes, every claim kept and the sessions paused (ADR 0010)
- [ ] Every failure has a ticket, and all are resolved
- [ ] `v1.0.0` is tagged and published to `latest`

## Comments

Decision by the maintainer: the Agent CLI terms-of-service question has been addressed and decided, so no further read of the Anthropic article is needed for the release. The analysis is deliberately not kept in the repo, because it would go stale when a provider changes its terms. The README's Agent CLI terms note stays as the reminder. The bullet and criterion about it were removed from this ticket.

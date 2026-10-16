# Copilot CLI adapter

Type: task
Status: ready-for-agent
Blocked by: 27, 36

Spec: [spec](../spec.md), user stories 57, 86, 87. "Agent adapters" (user-level agent-config exception, status mapping table). ADRs 0005, 0006. Recorded file shapes and event order: `research/hook-status-mapping.md` (tickets 17 and 19).

## What to build

GitHub Copilot CLI as the second first-class Agent CLI: launch with the pre-typed command, and session status through its hooks.

Copilot has no per-launch hook injection, so this uses the user-level agent-config exception:

- a dedicated, Dryland-owned hook file in the user's Copilot hooks directory, gated on `DRYLAND_PANE_KEY` so it is inert outside Dryland PTYs
- appending Dryland-created worktrees to Copilot's `trustedFolders`, so no trust prompt interrupts the launch

Rules: never rewrite unrelated keys, skip unparseable files, honour Copilot's config lock file and tolerate Copilot rewriting the file. Install, status and remove are available through `dryland doctor` (which also gains its hooks check here). The first such write is a confirmed write of the user-config type.

Status mapping: running from `userPromptSubmitted`, `preToolUse`, `postToolUse`; waiting from `permissionRequest` and `notification` (permission prompt); idle from `agentStop`; ended from `sessionEnd`. `sessionStart` fires only at the first submitted prompt, so "launched" comes from the PTY spawn and the CLI's own session id is learned at first submit. Copilot's idle notification is not relied on.

Session ids and resume (ADR 0010, `research/agent-cli-session-resume.md`), filling the adapter fields the paused-session tickets add: session variable `COPILOT_AGENT_SESSION_ID`; launch with `--session-id <uuid>`; resume with `--resume=<id>`, picker with `--resume`. Copilot silently starts a blank session under an unknown id, so the session-exists check looks for `~/.copilot/session-state/<id>/` before resuming. Its history is not per directory, so it is not reconciled.

The dev machine has no Copilot CLI. Build from the recorded shapes and event order; the real-CLI re-check is part of the v1.0.0 smoke checklist.

## Acceptance criteria

- [ ] `dryland doctor` can install, report the status of, and remove the hook file and the trust entries
- [ ] Tested against a temp home directory: after install then remove, the config file is byte-identical to before and unrelated keys were never touched
- [ ] An unparseable config file is skipped with a warning, never rewritten
- [ ] The config lock file is honoured, and a config rewritten by Copilot between read and write is handled without losing either side's changes
- [ ] The installed hook does nothing when `DRYLAND_PANE_KEY` is not set
- [ ] The first user-config write from the app asks for confirmation, with its own "do not ask again"
- [ ] Creating a worktree for a Copilot session adds it to `trustedFolders`; pruning the worktree removes the entry
- [ ] Contract tests with a fake-CLI stub fire each recorded Copilot hook event and assert the session state, including "launched" before any `sessionStart`
- [ ] The launch types the skill command in Copilot's syntax without submitting

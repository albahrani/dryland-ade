# Claude Code session status

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-15T09:13:57.435Z","was":"ready-for-agent"}} -->
Blocked by: 33, 35

Spec: [spec](../spec.md), user stories 46, 87. "Agent adapters" (status mapping table). ADR 0006. Earlier research: `research/hook-status-mapping.md`.

## What to build

Sessions report their state through Claude Code's own hooks. Dryland injects the hooks through Claude Code's per-launch settings flag, so nothing is written to the user's config. Each hook calls `dryland status`, which sends a Live event to the app.

Session states and their sources for Claude Code:

| Session state | Source |
| --- | --- |
| launched | Dryland's own PTY spawn |
| running | `UserPromptSubmit`, `PreToolUse`, `PostToolUse` |
| waiting | `Notification` (permission prompt, needs input), `PermissionRequest` |
| idle | `Stop`, `Notification` (idle prompt) |
| ended | `SessionEnd` |

The state is shown as a badge on the agent icon (working arc, waiting bubble, idle dash, ended square) with a text tooltip, on the session tab and on the ticket the session belongs to.

**First step: verify against the real CLI.** This column of the mapping comes from documentation only. Verify the per-launch settings hook injection and each event-to-state transition with the real Claude Code, record the observed event order next to the Copilot findings, and correct the mapping where reality differs.

## Acceptance criteria

- [ ] The observed Claude Code hook events and their order are recorded in the effort's research notes, and the adapter's mapping matches them
- [ ] Starting a Claude Code session writes nothing to user-level Claude config
- [ ] A session shows launched at spawn, running after a prompt is submitted, waiting at a permission prompt, idle when the agent stops, and ended when the CLI exits
- [ ] Each state is a badge on the agent icon with a tooltip
- [ ] The session's ticket shows the same badge in the Tickets view
- [ ] Contract tests with a fake-CLI stub fire each native hook event and assert the resulting session state through `dryland status` and the listener
- [ ] A Claude Code session started by the user outside Dryland produces no events

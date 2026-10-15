# Claude Code session status

Type: task
Status: resolved
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

- [x] The observed Claude Code hook events and their order are recorded in the effort's research notes, and the adapter's mapping matches them
- [x] Starting a Claude Code session writes nothing to user-level Claude config
- [x] A session shows launched at spawn, running after a prompt is submitted, waiting at a permission prompt, idle when the agent stops, and ended when the CLI exits
- [x] Each state is a badge on the agent icon with a tooltip
- [x] The session's ticket shows the same badge in the Tickets view
- [x] Contract tests with a fake-CLI stub fire each native hook event and assert the resulting session state through `dryland status` and the listener
- [x] A Claude Code session started by the user outside Dryland produces no events

## Answer

Built in df28633 and 7449009. Verified first against Claude Code 2.1.300 on Windows (two driven runs, recorded in research/hook-status-mapping.md): hooks from --settings fire alongside the user's own, run in Git Bash and inherit the PTY env; order with a permission prompt is SessionStart > UserPromptSubmit > PreToolUse > PermissionRequest > PostToolUse > Stop > SubagentStop > Notification:idle_prompt (60 s after Stop) > SessionEnd. The documented mapping held, so the adapter keeps it; SessionStart and SubagentStop stay unmapped. Core: hookSettings(statusEvents) builds the Claude settings (one command hook per native event running `dryland status session.<state>`, Notification subtypes as matchers, 5 s timeout) and SESSION_STATE_EVENTS/sessionStateOf is the one state<->event-kind table. Desktop: work.ts writes the settings atomically to <userData>/hooks/claude-code.json and launches `claude --settings <file>`, so nothing is written to user-level Claude config; the main process tracks each session (launched at spawn, then live events, ended on SessionEnd or when its terminal exits or is closed by Dryland) and sends states to the renderer; the app state carries sessions so a reload keeps the badges. The badge (agent icon plus arc/bubble/dash/square, tooltip 'Claude Code: <state>') shows on the session tab and on its ticket; a ticket with several sessions shows the one that most needs the user. Tests: 11 contract tests (fake claude fires each native event through the real dryland and listener, and none without --settings), work.ts launch/no-user-config test, session reducer and ticket-badge tests, e2e walking launched > working > waiting > idle > ended plus close-tab and reload. Known limits: hooks are synchronous, about 80 ms per hook call (async hooks unverified); Notification:permission_prompt and elicitation_dialog are mapped from docs but were not observed; a session's state is lost when the app restarts (by design, ADR 0008).

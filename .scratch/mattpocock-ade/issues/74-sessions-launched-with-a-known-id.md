# Sessions launched with a known id

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-16T20:54:03.497Z","was":"ready-for-agent"}} -->
Blocked by: 73

Spec: [spec](../spec.md), user stories 98, 101. "Sessions, pausing and resuming", "Agent adapters". ADRs 0006, 0008, 0010. `research/agent-cli-session-resume.md`.

## What to build

The app knows each session's Agent CLI id from spawn and keeps the index current from hooks.

- **Adapter fields**: the launch flag that sets the session id (`--session-id` for Claude Code), the resume arguments by id (`--resume <id>`) and without one (`--resume`, the CLI's picker). The session variable field comes from "Session index in core".
- **Launch**: `startWork` chooses a UUID, launches the CLI with it, and records it in the index for the ticket at spawn, before any hook fires. `SessionInfo` carries the CLI session id.
- **Hooks**: `dryland status` also sends the CLI session id it finds in the adapter's session variable, which the CLI sets for hooks. This is one new optional field in the live event, `agent_session_id` (the spec's event shape; ADR 0010 amends ADR 0008). On each state event the app updates the entry's last state and last seen. An id the item does not know yet, as after `/clear`, is recorded as the item's newest session; older ones stay.
- `CLAUDE_CODE_CHILD_SESSION` stays stripped from session environments: it hides the child's sessions from resume.

## Acceptance criteria

- [ ] Claude Code is launched with `--session-id <uuid>`, and the index holds that id for the ticket right after spawn
- [ ] A hook event updates the entry's last state and last seen (contract test with the fake-CLI stub)
- [ ] A hook event with a new CLI session id records it as the item's newest session and keeps the old one
- [ ] A live event without a CLI session id is handled as before; `dryland status` without the app stays a silent no-op
- [ ] `CLAUDE_CODE_CHILD_SESSION` is still removed from a session's environment
- [ ] Checked once against the real Claude Code on the dev machine: launch with `--session-id`, `/clear`, and the hook reports the new id (version recorded in the answer)

## Comments

From mattpocock-ade/40 (a6c8530): startWork no longer starts only on tickets. Its WorkTarget is a ticket, a map (session in <map>/scratch-wayfinder) or a new map (session in a fresh new-map/scratch-wayfinder-N). Recording at spawn must key map sessions by the map and new-map sessions by their scratch worktree branch, matching the item shape in mattpocock-ade/73.

From mattpocock-ade/73 (9068120): the index lives in packages/core/src/session-index.ts. recordSession(runner, cwd, item, {adapter, sessionId}) takes sessions.lock beside tracker.lock, writes atomically and applies retention; withSession is the pure merge it uses (moves a known session to the front, updates lastSeen, keeps its lastState, never duplicates). Nothing sets lastState yet: extend withSession/recordSession with an optional lastState rather than writing the file another way. Any lastState write the app holds back must become a flush step in shutdownSteps (see the comment from 41 on 73). currentAgentSession(AGENT_ADAPTERS, env) already reads the adapter's sessionEnv (CLAUDE_CODE_SESSION_ID), which dryland status can reuse for agent_session_id. Decisions carried over: a missing index reads as empty silently, only an unparseable one warns; a failed index write is a warning, never a failed command.

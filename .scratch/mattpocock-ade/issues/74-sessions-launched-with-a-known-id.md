# Sessions launched with a known id

Type: task
Status: resolved
Blocked by: 73

Spec: [spec](../spec.md), user stories 98, 101. "Sessions, pausing and resuming", "Agent adapters". ADRs 0006, 0008, 0010. `research/agent-cli-session-resume.md`.

## What to build

The app knows each session's Agent CLI id from spawn and keeps the index current from hooks.

- **Adapter fields**: the launch flag that sets the session id (`--session-id` for Claude Code), the resume arguments by id (`--resume <id>`) and without one (`--resume`, the CLI's picker). The session variable field comes from "Session index in core".
- **Launch**: `startWork` chooses a UUID, launches the CLI with it, and records it in the index for the ticket at spawn, before any hook fires. `SessionInfo` carries the CLI session id.
- **Hooks**: `dryland status` also sends the CLI session id it finds in the adapter's session variable, which the CLI sets for hooks. This is one new optional field in the live event, `agent_session_id` (the spec's event shape; ADR 0010 amends ADR 0008). On each state event the app updates the entry's last state and last seen. An id the item does not know yet, as after `/clear`, is recorded as the item's newest session; older ones stay.
- `CLAUDE_CODE_CHILD_SESSION` stays stripped from session environments: it hides the child's sessions from resume.

## Acceptance criteria

- [x] Claude Code is launched with `--session-id <uuid>`, and the index holds that id for the ticket right after spawn
- [x] A hook event updates the entry's last state and last seen (contract test with the fake-CLI stub)
- [x] A hook event with a new CLI session id records it as the item's newest session and keeps the old one
- [x] A live event without a CLI session id is handled as before; `dryland status` without the app stays a silent no-op
- [x] `CLAUDE_CODE_CHILD_SESSION` is still removed from a session's environment
- [x] Checked once against the real Claude Code on the dev machine: launch with `--session-id`, `/clear`, and the hook reports the new id (version recorded in the answer)

## Comments

From mattpocock-ade/40 (a6c8530): startWork no longer starts only on tickets. Its WorkTarget is a ticket, a map (session in <map>/scratch-wayfinder) or a new map (session in a fresh new-map/scratch-wayfinder-N). Recording at spawn must key map sessions by the map and new-map sessions by their scratch worktree branch, matching the item shape in mattpocock-ade/73.

From mattpocock-ade/73 (9068120): the index lives in packages/core/src/session-index.ts. recordSession(runner, cwd, item, {adapter, sessionId}) takes sessions.lock beside tracker.lock, writes atomically and applies retention; withSession is the pure merge it uses (moves a known session to the front, updates lastSeen, keeps its lastState, never duplicates). Nothing sets lastState yet: extend withSession/recordSession with an optional lastState rather than writing the file another way. Any lastState write the app holds back must become a flush step in shutdownSteps (see the comment from 41 on 73). currentAgentSession(AGENT_ADAPTERS, env) already reads the adapter's sessionEnv (CLAUDE_CODE_SESSION_ID), which dryland status can reuse for agent_session_id. Decisions carried over: a missing index reads as empty silently, only an unparseable one warns; a failed index write is a warning, never a failed command.

## Answer

Built in e273a26. Adapters gained sessionIdFlag and resumeFlag (Claude Code: --session-id, --resume) with sessionIdArgs/resumeArgs in core. startWork picks a UUID per launch (SessionInfo.agentSessionId, distinct from the Dryland session id) and records it via recordSession for the item before the spawn: tickets as <map>/<NN>, maps by name, new maps by scratch worktree branch (sessionItem in desktop/src/main/session-recording.ts). withSession/recordSession take an optional lastState. dryland status (and every live event) sends agent_session_id from the adapter's sessionEnv; the app's SessionRecorder applies state events in order (running/waiting/idle set lastState, ended only lastSeen), an unknown id becoming the newest session, and its pending writes are a 'flush session index' shutdown step. Found and fixed: the app's own dryland runs inherited CLAUDE_CODE_SESSION_ID when Dryland was started from a Claude Code session, recording that parent session on Start work's claim; DrylandCli now strips every adapter's sessionEnv. Verified on the real CLI: claude -p with --session-id on 2.1.301 (hooks see the id in CLAUDE_CODE_SESSION_ID and on stdin); interactive launch plus /clear on 2.1.302 in a node-pty: /clear fires SessionEnd for the launched id, then SessionStart/UserPromptSubmit/Stop under a new id. Known limit, filed separately: that SessionEnd marks the live session ended in the app's status (ended is sticky). Tests: pnpm test (379) and test:linux (381), e2e native and Linux (22 each).

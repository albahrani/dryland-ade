# Agent CLI session ids and resume

Type: research
Blocked by: 69
Status: resolved

## Question

For Claude Code and GitHub Copilot CLI, establish from primary sources (and a local check for Claude Code): (1) whether the CLI's session id is exposed to child processes through the environment (Claude Code's CLAUDE_CODE_SESSION_ID was seen in 2.1.300) and to hooks, and whether it changes after /clear, after compaction and on resume; (2) how to resume a session by id interactively (claude --resume <id>, copilot equivalent) and what happens when the id is unknown; (3) whether a session id can be chosen at launch (claude --session-id); (4) where each CLI keeps its session history per working directory and what can be read from it without relying on the transcript format (file names, timestamps, Copilot's documented session store); (5) what each CLI does on continue or resume when there is nothing to resume. Record findings in research/agent-cli-session-resume.md.

## Answer

Findings in research/agent-cli-session-resume.md (Claude Code checked locally on 2.1.301; Copilot CLI from docs and changelog only, unverified).

- Session id in the environment: Claude Code sets CLAUDE_CODE_SESSION_ID for tool processes, hooks and MCP servers; it changes on /clear (documented, not observed), survives compaction and resume, and subagents carry the parent's id. Copilot sets COPILOT_AGENT_SESSION_ID (1.0.29); whether it updates after /clear is undocumented.
- Resume by id: claude --resume <id> (unknown id: "No conversation found with session ID", exit 1); copilot --resume=<id> (unknown id silently starts a blank session under that id).
- Both CLIs accept --session-id <uuid> at launch.
- History: Claude Code keeps ~/.claude/projects/<path-slug>/<id>.jsonl per working directory, deleted after 30 days; Copilot keeps ~/.copilot/session-state/<id>/ plus a SQLite store, not per directory, formats undocumented.
- Nothing to continue: claude -p --continue starts fresh; copilot --continue picks the most recent session of any project.

Applied to ADR 0010 and the spec: launch with --session-id; check the session still exists before resume-by-id; history reconciliation is Claude Code only, Copilot sessions come from hooks and dryland commands. Build notes in the map's fog: Copilot's COPILOT_AGENT_SESSION_ID, keep stripping CLAUDE_CODE_CHILD_SESSION.

# Agent CLI session ids and resume

Type: research
Blocked by: 69

## Question

For Claude Code and GitHub Copilot CLI, establish from primary sources (and a local check for Claude Code): (1) whether the CLI's session id is exposed to child processes through the environment (Claude Code's CLAUDE_CODE_SESSION_ID was seen in 2.1.300) and to hooks, and whether it changes after /clear, after compaction and on resume; (2) how to resume a session by id interactively (claude --resume <id>, copilot equivalent) and what happens when the id is unknown; (3) whether a session id can be chosen at launch (claude --session-id); (4) where each CLI keeps its session history per working directory and what can be read from it without relying on the transcript format (file names, timestamps, Copilot's documented session store); (5) what each CLI does on continue or resume when there is nothing to resume. Record findings in research/agent-cli-session-resume.md.

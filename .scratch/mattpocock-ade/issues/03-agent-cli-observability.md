# Agent CLI observability and subscription-safe interaction

Type: research
Status: resolved
Blocked by:

## Question

For Claude Code and GitHub Copilot CLI (plus Codex/Gemini/others briefly): what on-disk session/transcript formats and locations exist, which hooks/events or notification mechanisms are available, how to pre-type or launch with an initial prompt/slash command, how skills are invoked, and what the terms/policies say about subscription use via third-party wrappers (is `-p`/stream-json headless use subscription-safe?). Write to `.scratch/mattpocock-ade/research/agent-cli-observability.md`.

## Answer

Claude Code and Copilot CLI both give the ADE everything it needs: documented hook systems (Claude Code's 30+ events, Copilot's `sessionStart`/`preToolUse`/`postToolUse`/etc., both configured via JSON in `~/.claude`/`~/.copilot`), `-p`/headless + `stream-json`/programmatic modes that are first-party-supported and run under the user's own subscription login by default (not API billing), and `SKILL.md`-based skills discovery. On-disk transcripts: Claude Code's `~/.claude/projects/<proj>/<session>.jsonl` is explicitly disclaimed by Anthropic as internal/unstable (use hooks' `transcript_path` instead); Copilot CLI's `~/.copilot/session-store.db` (SQLite) is officially documented to exist. The terms-of-service topic was addressed and decided. The analysis is not kept in the repo. Codex CLI and Gemini CLI got brief coverage.

Full findings, citations, and an explicit "not found" list: `.scratch/mattpocock-ade/research/agent-cli-observability.md`.

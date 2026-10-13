# How multi-agent tools manage per-CLI status hooks

Type: research
Status: resolved
Blocked by:

## Question

How do software projects that support several coding agent CLIs (Orca, plus e.g. Vibe Kanban, Conductor, claude-squad, Crystal/Nimbalyst, agent-deck, Emdash, cmux or similar) get live session status (running / waiting for input / idle / ended) out of each CLI? For each: hook install mechanism and location (user-level vs project-local vs per-launch flag/env), whether it modifies user config, how it degrades for CLIs without hooks (PTY heuristics, transcript tailing), how it removes/cleans up. Then, specifically for Claude Code and GitHub Copilot CLI: which per-launch or project-local hook injection options exist (e.g. Claude Code `--settings`, project `.claude/settings.local.json`, Copilot hooks locations/flags/env) so nothing is written to user-level config. Write to `.scratch/mattpocock-ade/research/multi-agent-hooks.md` with source links, flagging anything unverified.

## Answer

Findings: `.scratch/mattpocock-ade/research/multi-agent-hooks.md`.

Gist: of the 7 surveyed tools, Vibe Kanban and Crystal/Nimbalyst drive Claude Code headlessly via `--output-format stream-json` (no hooks needed); claude-squad falls back to pure tmux pane-content diffing/substring matching; agent-deck, Emdash, and cmux all write Claude Code hooks straight into the user's real `~/.claude/settings.json` by default (violates the ADE's no-user-config-write constraint); Conductor is closed-source/unverified. For the ADE itself: Claude Code's documented `--settings` flag (inline JSON or file path, applied per-invocation above all settings files) is the cleanest no-user-config-write path, confirmed directly from `code.claude.com/docs/en/settings`; a pre-written `.claude/settings.local.json` inside the ADE's worktree also works for reads (one caveat flagged: Claude Code's own *write* target for permission approvals resolves to the main checkout root in a worktree, not the worktree itself — doesn't affect pre-populated hook files). For Copilot CLI, no hooks-only flag/env override exists — only `COPILOT_HOME`, which swaps the entire config root, not just hooks; the no-user-config-write path is a `.github/hooks/*.json` file placed inside the worktree, resolved via "repository root" per docs, though worktree-specific resolution is not explicitly confirmed by GitHub's docs and is flagged as an inference from ordinary git semantics.

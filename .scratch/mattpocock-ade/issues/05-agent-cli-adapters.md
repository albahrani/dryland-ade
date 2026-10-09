# Supported Agent CLIs and adapter seam

Type: grilling
Status: resolved
Blocked by: 01, 03, 08

## Question

Which Agent CLIs are v1 first-class (Claude Code, GitHub Copilot CLI) and which best-effort, and what does the agent-adapter seam cover (launch, pre-typed skill command, session observation, status)? How much is reused from Orca?


## Answer

- **Tiers**: Claude Code and GitHub Copilot CLI are first-class (full adapter, verified: Copilot on the dev machine, Claude on a second machine). All other Agent CLIs are best-effort: launch plus pre-typed command, no status guarantee.
- **Adapter seam**: an `AgentAdapter` interface in the pure core, backed by declarative config entries (binary, launch args, skill-command syntax, initial-prompt handling, hook-injection method, status-event mapping). Small code hooks only where a CLI needs them (first-class CLIs).
- **Launch**: spawn the interactive CLI in a PTY inside the ticket's ADE-created worktree and type the recommended skill command without Enter; auto-submit is opt-in. No `-p` / initial-prompt-argument launch (they submit immediately). This is the same as a human at a terminal.
- **Status observation**: via hooks, never user-level config. Claude Code: `--settings` injected per launch. Copilot CLI: git-ignored `.github/hooks/*.json` written into the worktree (per-worktree resolution to verify on the dev machine). CLIs without hooks: PTY heuristics, status marked approximate. Transcripts only as best-effort fallback. Hooks call `ade`; reporting is fire-and-forget and a silent no-op when the ADE is closed, so status is live-only and the ADE rebuilds from files and git on start.
- **Session-to-ticket link**: ADE records session, worktree and ticket at spawn; sessions later started by hand in an ADE-created worktree link by cwd; branches not created via the ADE show as unlinked (commit trailer fallback).
- **Orca reuse** (MIT, attributed): CLI config-table pattern, Windows ConPTY handling, worktree slug logic. Not reused: UI, structured `claude --print` stream-json mode (out of v1).
- **Risks/follow-ups**: Copilot worktree hook resolution to verify.
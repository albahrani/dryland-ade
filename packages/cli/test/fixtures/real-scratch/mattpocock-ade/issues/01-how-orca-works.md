# How Orca works

Type: research
Status: resolved
Blocked by:

## Question

Study https://github.com/stablyai/orca. How does it: (1) run Claude Code under the user's subscription without the Claude API/SDK (PTY? hooks? transcript reading? any `-p`/stream-json use?), (2) which Agent CLIs it supports (incl. GitHub Copilot CLI) and how the per-CLI adapters are structured and reusable, (3) manage worktrees/branches and parallel sessions, (4) embed terminals (PTY lib, Windows/ConPTY), (5) its stack and licence (what can be taken over). Write findings with source links to `.scratch/mattpocock-ade/research/orca.md`.

## Answer

Orca spawns the user's own installed CLI binaries (e.g. `claude`, `copilot`, `codex`, 46 CLIs total) inside `node-pty` pseudo-terminals — never calling the Claude API/SDK as a hosted service. For Claude's "structured" mode it does depend on `@anthropic-ai/claude-agent-sdk`, but overrides the SDK's spawn hook to shell out to the user's own `claude --print --output-format stream-json` process instead of the SDK's API transport, plus installs native Claude Code `settings.json` hooks for status tracking (same hook pattern exists for Gemini, Muse and **GitHub Copilot CLI**, which is already supported, not hypothetical). Per-CLI differences are a single declarative config table (`TUI_AGENT_CONFIG`/`TuiAgentConfig`) keyed by CLI id — adding a CLI is "one table entry," not a new adapter class. Worktrees use slugified names + configurable branch prefix, WSL-aware paths, and tested collision-suffixing. Terminal rendering uses a patched `node-pty` + xterm.js (WebGL addon), with explicit Windows ConPTY handling and a separate `windows-wsl` PTY backend. Stack: Electron 43 + React 19 + TypeScript 7, pnpm monorepo (`src/` desktop, `native/` Rust/platform addons, `cloud/` relay, `mobile/` Expo app). **License: MIT** — fully reusable (with attribution) for a fresh, non-forked build.

Full findings with file/line citations: [`../research/orca.md`](../research/orca.md)

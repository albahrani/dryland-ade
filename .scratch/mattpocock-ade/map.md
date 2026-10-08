# Map: Matt Pocock ADE

## Destination

A product spec plus an ADR set for a cross-platform desktop ADE optimized for repos using the Matt Pocock skills, with all major architecture decisions made and v1 scope clear enough to slice into build tickets. Nothing is built during wayfinding.

## Notes

- Domain: agent development environment (ADE). Inspiration but NOT a fork: https://github.com/stablyai/orca (research input only; fresh build).
- Shows, from skill artifacts and git: what is open/done, next steps, which skill fits which ticket, plus worktrees/branches/commits in context of features, tickets and maps.
- Hard constraint: agents are driven via their own CLIs under the user's subscription (embedded terminal/PTY, passive observation via transcripts/hooks). No Claude API, no Claude Agent SDK. Interactivity is limited accordingly; research how Orca does it.
- First-class Agent CLIs: Claude Code and GitHub Copilot CLI (only Copilot is available on the dev machine); as many others as cheaply possible, leaning on what can be taken over from Orca.
- Trackers in v1: local-markdown, GitHub, GitLab (via `gh`/`glab` CLIs, no stored tokens), selected from `docs/agents/issue-tracker.md`.
- Source of truth is the repo; the ADE is a lens plus actuator with minimal local UI state.
- v1 supports only the default setup produced by `setup-matt-pocock-skills`; custom skill modifications are out of scope.
- Next-step logic is a deterministic rule engine, explainable ("why this next"), no LLM.
- Worktree creation by the ADE: `<effort>/<NN>-<slug>` naming, commit trailer as fallback; unmatched branches show as "unlinked".
- Starting work: ADE creates worktree and opens an Agent CLI PTY with the recommended skill command pre-typed (auto-submit is opt-in).
- Parallelism: need a worktree/branch strategy so many sessions can work on tickets/grills/maps at once without concurrent write problems. For local-markdown, shared state (e.g. ticket claims) must live in one central place (e.g. main branch) so everyone including the UI sees it consistently; GitHub/GitLab are easier.
- ADE writes: mechanical metadata edits are fine; content edits only where they fit the skill workflow and improve life for the user, but don't couple deeply to skill details that may change.
- Platform agnostic design (Windows, macOS, Linux); verification Windows-first. Single user, local only, multiple projects.
- Vocabulary: see root `GLOSSARY.md`. Consult skills `grilling`, `domain-modeling`, `research`, `prototype` as ticket types require.
- Research capture: repo has no commits/remote yet, so research findings go in `.scratch/mattpocock-ade/research/<name>.md` instead of throwaway branches.

## Decisions so far

- Skills artifact/workflow inventory done: `ask-matt` is the authoritative workflow-order map (`grill-with-docs` → `to-spec` → `to-tickets` → `implement`/`implement-spec` → `pr` → `retro`); local-markdown tracker state (`Status:`/`Type:`/`Blocked by:`/`## Comments`/`## Answer`/map Decisions-so-far) is fully file-derivable, claim races and session/process state are not — see `.scratch/mattpocock-ade/research/skills-inventory.md`.
- Orca internals researched: no Claude API/SDK calls — it spawns the user's own CLI binaries (incl. Copilot CLI) in `node-pty` PTYs, and for Claude's structured mode overrides the Agent SDK's spawn hook to shell out to the user's `claude --print --output-format stream-json` instead of using the SDK's API transport; per-CLI differences are one declarative config-table entry (pluggable); worktrees use slugified names + branch prefix + collision-suffixing; terminals render via patched `node-pty` + xterm.js with explicit Windows ConPTY/`windows-wsl` handling; stack is Electron+React+TS pnpm monorepo, **MIT licensed** (freely reusable, no fork needed) — see `.scratch/mattpocock-ade/research/orca.md`.
- Agent CLI observability researched: Claude Code and Copilot CLI both have documented hooks and subscription-authenticated `-p`/headless `stream-json` modes suitable for PTY-based observation (Claude Code's JSONL transcript format is explicitly unofficial/unstable per Anthropic; Copilot's `~/.copilot/session-store.db` is officially documented); the terms-of-service topic was addressed and decided — see `.scratch/mattpocock-ade/research/agent-cli-observability.md`.

## Not yet specified

- Views and UX: which screens (map/frontier board, ticket detail, worktree graph, session list), how git is shown in feature context.
- Tracker adapter details and normalized ticket model across local-markdown/GitHub/GitLab, incl. blocking and claim fallbacks.
- ADE write policy specifics (which edits, how presented) once the artifact inventory is known.
- Session observation design (status, which ticket a session touched) once CLI observability is known.
- Settings surface and handling of non-default skill setups (detect and warn?).
- Packaging, auto-update, distribution; testing strategy for the rule engine and adapters.
- Spec/ADR authoring itself (the final deliverable) once the route is clear.

## Out of scope

- Customized or modified Matt Pocock skill setups (would need AI-assisted adaptation); v1 targets defaults only.
- Teams, remote or cloud sessions, multi-user collaboration.
- Using Claude API / Agent SDK; forking Orca.
- Actually building the ADE.

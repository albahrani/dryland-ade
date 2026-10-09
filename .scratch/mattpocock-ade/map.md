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
- v1 supports the default setup produced by `setup-matt-pocock-skills` plus the ADE tracker (the ADE's own CLI registered as the "Other" tracker, see ADR 0001); custom skill modifications are out of scope.
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

- [Parallel work and shared-state strategy](issues/04-parallel-work-strategy.md): the ADE ships a standalone `ade` CLI as the single write path for tickets/map index (fronting local-markdown, `gh`, `glab`), state in the main checkout, auto-committed by pathspec, one worktree per ticket, prose files merged via git — see ADR 0001.

- [Desktop stack and terminal embedding](issues/06-desktop-stack.md): Electron + TypeScript (React, pnpm, `electron-vite`), `node-pty` + xterm.js, pure core package shared with the `ade` CLI (run via Electron node mode), PTYs owned by the app with no daemon, quit/shutdown leaves a consistent state, MIT licensed with selective attributed Orca reuse — see ADR 0002.

- [How multi-agent tools manage per-CLI status hooks](issues/08-multi-agent-hook-management.md): most peers write hooks into the user's `~/.claude/settings.json` (rejected for the ADE) or avoid hooks via headless stream-json / tmux scraping; Claude Code's `--settings` flag injects hooks per launch with no user-config write, while Copilot CLI has no hooks-only flag/env (only whole-root `COPILOT_HOME`) so a `.github/hooks/*.json` inside the worktree is the no-user-config path (worktree resolution unconfirmed) — see `.scratch/mattpocock-ade/research/multi-agent-hooks.md`.

- [Supported Agent CLIs and adapter seam](issues/05-agent-cli-adapters.md): Claude Code + Copilot CLI first-class, others best-effort; declarative adapter entries; PTY launch with pre-typed (not submitted) skill command; status via per-launch/worktree-local hooks (never user-level config), fire-and-forget to `ade`; session-ticket link via ADE-created worktree; selective Orca reuse, no structured mode.

- [Upstream skill catalog and workflow routing](issues/09-upstream-skill-catalog.md): local install is an exact 1:1 mirror of upstream (38 skills, `to-prd`/`to-issues` renamed `to-spec`/`to-tickets`); only ~6 skills have mechanical artifact triggers — see `.scratch/mattpocock-ade/research/skills-catalog.md`.
- [Next-step rule engine](issues/07-next-step-rule-engine.md): pure, ordered, explainable rules over a normalized snapshot (incl. live session state); routes only the mechanically triggerable skills (setup, triage, wayfinder, to-spec, to-tickets, implement/implement-spec, pr, retro); fixed priority with waiting sessions first; stale claims flagged not auto-released.

- [ade CLI surface, normalized ticket model and live reporting](issues/10-ade-cli-surface.md): command groups `ticket`/`map`/`worktree`/`status`/`doctor` with `--json`; one normalized ticket model over all backends with unchanged local-markdown format; localhost live reporting with per-launch token, silent no-op when ADE is closed; small event schema incl. `ticket.changed`; events not stored.

- [Views and UX](issues/11-views-and-ux.md): VS Code-style IDE shell (activity bar Tickets/Maps/Sessions, editor tabs with ticket/session + terminal + file/diff tabs, right Explorer + Source Control scoped to the selected worktree, collapsible live-events panel, status bar); tickets tree groups by map, then kind (Fog / Planning / Implementation) with status as icon only; next-up marked by gold bar + star; recommended command pre-typed, never auto-submitted; prototype kept in .scratch/mattpocock-ade/prototype/views-and-ux/.

## Not yet specified

- Product name and branding ("ADE" is a working name).
- ADE write policy specifics (which edits, how presented) once the artifact inventory is known.
- Per-CLI hook-event-to-status mapping and verification (Copilot worktree hook resolution).
- Settings surface and handling of non-default skill setups (detect and warn?).
- Packaging, auto-update, distribution (`ade` shim install, signing); testing strategy for the rule engine and adapters.
- Shutdown-time cleanup details (what runs within the OS shutdown limit) once the session model is known.
- Screens not yet designed: Settings, new map/ticket dialogs, merge/PR flow in Source Control, project switching.
- Spec/ADR authoring itself (the final deliverable) once the route is clear.

## Out of scope

- Customized or modified Matt Pocock skill setups (would need AI-assisted adaptation); v1 targets defaults only.
- Teams, remote or cloud sessions, multi-user collaboration.
- Using Claude API / Agent SDK; forking Orca.
- Actually building the ADE.


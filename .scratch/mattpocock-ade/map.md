# Map: Matt Pocock ADE

## Destination

A product spec plus an ADR set for a cross-platform desktop ADE optimized for repos using the Matt Pocock skills, with all major architecture decisions made and v1 scope clear enough to slice into build tickets. Nothing is built during wayfinding.

## Notes

- Domain: agent development environment (ADE). Inspiration but NOT a fork: https://github.com/stablyai/orca (research input only; fresh build).
- Shows, from skill artifacts and git: what is open/done, next steps, which skill fits which ticket, plus worktrees/branches/commits in context of features, tickets and maps.
- Hard constraint: agents are driven via their own CLIs under the user's subscription (embedded terminal/PTY, passive observation via transcripts/hooks). No Claude API, no Claude Agent SDK. Interactivity is limited accordingly; research how Orca does it.
- First-class Agent CLIs: Claude Code and GitHub Copilot CLI (Copilot was verified on the earlier dev machine; the current dev machine has Claude Code only, so the Claude adapter is the one verifiable locally); as many others as cheaply possible, leaning on what can be taken over from Orca.
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

- **Exception to no-user-config (v1, decided):** reliability beats purity. The ADE may make narrow, ADE-owned, reversible writes to user-level agent config when that makes status hooks and first-launch trust work reliably: e.g. a dedicated `~/.copilot/hooks/<ade>.json` (or the equivalent per CLI) gated by env vars set only on ADE PTYs so it is inert elsewhere, and appending ADE worktrees to Copilot's `trustedFolders`. Never rewrite unrelated keys; skip on unparseable files; provide install/status/remove in `ade doctor`. Supersedes the 'never user-level config' lines in the adapter and hook-management decisions; applies to other agent CLIs too where it simplifies hooks. Prior art: Orca (see research/hook-status-mapping.md addendum).

## Decisions so far

- Skills artifact/workflow inventory done: `ask-matt` is the authoritative workflow-order map (`grill-with-docs` → `to-spec` → `to-tickets` → `implement`/`implement-spec` → `pr` → `retro`); local-markdown tracker state (`Status:`/`Type:`/`Blocked by:`/`## Comments`/`## Answer`/map Decisions-so-far) is fully file-derivable, claim races and session/process state are not — see `.scratch/mattpocock-ade/research/skills-inventory.md`.
- Orca internals researched: no Claude API/SDK calls — it spawns the user's own CLI binaries (incl. Copilot CLI) in `node-pty` PTYs, and for Claude's structured mode overrides the Agent SDK's spawn hook to shell out to the user's `claude --print --output-format stream-json` instead of using the SDK's API transport; per-CLI differences are one declarative config-table entry (pluggable); worktrees use slugified names + branch prefix + collision-suffixing; terminals render via patched `node-pty` + xterm.js with explicit Windows ConPTY/`windows-wsl` handling; stack is Electron+React+TS pnpm monorepo, **MIT licensed** (freely reusable, no fork needed) — see `.scratch/mattpocock-ade/research/orca.md`.
- Agent CLI observability researched: Claude Code and Copilot CLI both have documented hooks and subscription-authenticated `-p`/headless `stream-json` modes suitable for PTY-based observation (Claude Code's JSONL transcript format is explicitly unofficial/unstable per Anthropic; Copilot's `~/.copilot/session-store.db` is officially documented); the terms-of-service topic was addressed and decided — see `.scratch/mattpocock-ade/research/agent-cli-observability.md`.

- [Parallel work and shared-state strategy](issues/04-parallel-work-strategy.md): the ADE ships a standalone `ade` CLI as the single write path for tickets/map index (fronting local-markdown, `gh`, `glab`), state in the main checkout, auto-committed by pathspec, one worktree per ticket, prose files merged via git — see ADR 0001.

- [Desktop stack and terminal embedding](issues/06-desktop-stack.md): Electron + TypeScript (React, pnpm, `electron-vite`), `node-pty` + xterm.js, pure core package shared with the `ade` CLI (run via Electron node mode), PTYs owned by the app with no daemon, quit/shutdown leaves a consistent state, MIT licensed with selective attributed Orca reuse — see ADR 0002.

- [How multi-agent tools manage per-CLI status hooks](issues/08-multi-agent-hook-management.md): most peers write hooks into the user's `~/.claude/settings.json` (rejected for the ADE) or avoid hooks via headless stream-json / tmux scraping; Claude Code's `--settings` flag injects hooks per launch with no user-config write, while Copilot CLI has no hooks-only flag/env (only whole-root `COPILOT_HOME`) so a `.github/hooks/*.json` inside the worktree is the no-user-config path (worktree resolution unconfirmed) — see `.scratch/mattpocock-ade/research/multi-agent-hooks.md`.

- [Supported Agent CLIs and adapter seam](issues/05-agent-cli-adapters.md): Claude Code + Copilot CLI first-class, others best-effort; declarative adapter entries; PTY launch with pre-typed (not submitted) skill command; status via hooks (per-launch/worktree-local preferred; narrow ADE-owned user-config writes allowed, see Notes exception), fire-and-forget to `ade`; session-ticket link via ADE-created worktree; selective Orca reuse, no structured mode.

- [Upstream skill catalog and workflow routing](issues/09-upstream-skill-catalog.md): local install is an exact 1:1 mirror of upstream (38 skills, `to-prd`/`to-issues` renamed `to-spec`/`to-tickets`); only ~6 skills have mechanical artifact triggers — see `.scratch/mattpocock-ade/research/skills-catalog.md`.
- [Next-step rule engine](issues/07-next-step-rule-engine.md): pure, ordered, explainable rules over a normalized snapshot (incl. live session state); routes only the mechanically triggerable skills (setup, triage, wayfinder, to-spec, to-tickets, implement/implement-spec, pr, retro); fixed priority with waiting sessions first; stale claims flagged not auto-released.

- [ade CLI surface, normalized ticket model and live reporting](issues/10-ade-cli-surface.md): command groups `ticket`/`map`/`worktree`/`status`/`doctor` with `--json`; one normalized ticket model over all backends with unchanged local-markdown format; localhost live reporting with per-launch token, silent no-op when ADE is closed; small event schema incl. `ticket.changed`; events not stored.

- [Views and UX](issues/11-views-and-ux.md): VS Code-style IDE shell (activity bar Tickets/Maps/Sessions, editor tabs with ticket/session + terminal + file/diff tabs, right Explorer + Source Control scoped to the selected worktree, collapsible live-events panel, status bar); tickets tree groups by map, then kind (Fog / Planning / Implementation) with status as icon only; next-up marked by gold bar + star; recommended command pre-typed, never auto-submitted; prototype kept in .scratch/mattpocock-ade/prototype/views-and-ux/.

- [Hook-event-to-status mapping and Copilot worktree hooks](issues/12-hook-status-mapping.md): Claude and Copilot both expose notification-type (waiting/idle), stop (idle) and session-end (ended) events, so Copilot does have a waiting signal; worktree-local Copilot hooks unconfirmed (folder trust blocked headless test), follow-up is the verify-copilot-worktree-hooks ticket - see `.scratch/mattpocock-ade/research/hook-status-mapping.md`.

- [ADE write policy and non-default skill setups](issues/13-write-policy-and-skill-setup.md): ADE writes tracker metadata via `ade` (confirm click except ticket-started actions, per-type don't-ask-again, git log = audit); prose only as minimal marked, skill-ignorable ADE-owned annotations (none in v1); fingerprint-based skill setup state on every startup, modified setups get a dialog (run compat check / skip / accept) and an agent-written compatibility verdict that toggles features; detect-warn-degrade, never refuse or auto-repair; see ADR 0003.

- [Packaging, distribution and testing](issues/14-packaging-and-testing.md): electron-builder, unsigned GitHub Releases, electron-updater latest/beta channels (macOS notify-only), ade launcher in install dir, 2s shutdown budget, Vitest-based test layers; see ADR 0004.

- [Remaining screens](issues/15-remaining-screens.md): Settings (6 tabs), New map (agent choice only, pre-types `/wayfinder`), New ticket (`ade ticket create` behind confirm), Merge/PR in Source Control (dry-run checks, local merge or `gh`/`glab` PR, conflicts handed to the agent), project switcher with live-session counts; prototype in `prototype/views-and-ux/screens.js`.

- [Product name and branding](issues/16-product-name.md): **Dryland ADE** (short: Dryland), binary `dryland`, npm scope `@dryland/*`, repo `dryland-ade`, appId `dev.dryland.ade` (placeholder owner); unofficial, community-made, with visible love for Matt Pocock's skills.

- [Verify Copilot hook and trust setup end to end](issues/17-verify-copilot-worktree-hooks.md): a global env-gated `~/.copilot/hooks/<ade>.json` fires sessionStart/agentStop/sessionEnd under `copilot -p` (even in untrusted worktrees) and is inert without the env var; appending to `trustedFolders` is clean and reversible; interactive-mode trust prompt unverified; exact shapes in `research/hook-status-mapping.md`.

- [GitHub project preparation and release checklist](issues/18-github-project-preparation.md): repo `dryland-ade`, squash to one clean initial commit after a secrets/path scan, nothing moved (skill-expected paths stay), standard OSS files + templates, SHA-pinned 3-OS CI and tag-driven release, `v0.1.0-beta.1` first, 1.0 after Windows smoke checklist, branch protection and Dependabot.

- [Verify Copilot hooks and trust prompt in interactive mode](issues/19-verify-copilot-interactive-mode.md): interactive Copilot fires the global env-gated hooks (inert without the env var), a `trustedFolders` entry suppresses the trust prompt and removes cleanly, waiting = `permissionRequest`/`notification(permission_prompt)`, idle = `agentStop`; `sessionStart` fires only at first submit, so "launched" state comes from the ADE's own PTY spawn.

- Spec and ADR set authored: [spec](spec.md) (`ready-for-agent`, uses `dryland` and `DRYLAND_*` / `<!-- dryland: -->` / `.dryland/` throughout); ADRs 0005 (user-level agent-config exception), 0006 (Agent adapters and hook-sourced status), 0007 (next-step rule engine), 0008 (CLI surface, normalized ticket model, live reporting); rename note added to ADRs 0001 to 0004; glossary gained ticket kind, stale claim, next-up marker, live event, unlinked branch. Build order starts with the Claude Code adapter, whose verification is its first implementation ticket.

- [Workspace and dryland ticket list](issues/20-workspace-and-ticket-list.md): pnpm workspace (`core`, `cli`, stub `desktop`), Vitest and the temp-repo CLI harness; `ticket list` finds the main checkout from any worktree, and git runs only through the `ProcessRunner` seam.

- [CI on three OSes](issues/21-ci-on-three-oses.md): SHA-pinned workflow runs typecheck, lint and Vitest on Windows, macOS and Linux with minimal permissions; Dependabot covers npm and Actions; actionlint passes locally, not yet run on real runners.

- [Maps and the full ticket model](issues/22-maps-and-full-ticket-model.md): `ticket show`, `map show` and `map frontier` on the normalized model; kind is derived, never stored; annotations parse transparently; read-only.

- [Claim and release under a lock](issues/23-claim-and-release-under-a-lock.md): The tracker write path: main checkout only, atomic, locked, pathspec commit with warnings; one winner among parallel claims; stale locks recover.

- [Ticket create and resolve](issues/24-ticket-create-and-resolve.md): `ticket create` numbers under the lock and round-trips through `show`; `ticket resolve` records the answer, releases the claim and never touches the worktree.

- [Block, comment, triage and map index](issues/25-block-comment-triage-and-map-index.md): ticket block, comment and triage plus map index, all through the shared tracker write path; line endings preserved per line, a bare Nothing. placeholder gives way to the first index entry.

- [Worktrees: create, list and prune](issues/26-worktrees.md): `dryland worktree create`, `list` and `prune`; names are `<map>/<NN>-<slug>` or `<map>/scratch-<slug>`, branches start from the default branch, a `Dryland-Ticket:` trailer is the fallback link, and prune names every failed condition and needs `--yes`.

- [dryland doctor basics](issues/27-dryland-doctor-basics.md): `dryland doctor [--json]` checks setup, tracker (gh/glab installed and logged in for GitHub/GitLab) and a runnable dryland on PATH; failing checks name the next action and exit 1, and it still reports outside a git repo.

- [Harden dryland doctor tests and tidy its helpers](issues/63-harden-dryland-doctor-tests-and-tidy-its-helpers.md): dryland doctor's forge tracker path is tested through the CLI, PATH isolation is deterministic, and exists()/PATH key lookup are shared.

- [Rule engine: map workflow rules](issues/28-rule-engine-map-workflow-rules.md): Pure nextSteps(snapshot) in core with the setup, frontier, fog-only, cleared-map and spec-without-tickets rules, each with a reason and evidence.

- [Rule engine: remaining rules](issues/29-rule-engine-remaining-rules.md): Waiting sessions, stale-claim flags, triage, implement, pr and retro rules, why-not and compatibility disabling complete the next-step engine.

- [Feed git state into the repo snapshot](issues/64-feed-git-session-and-skill-setup-state-into-the-re.md): readRepoSnapshot fills git from Linked worktrees; sessions and skill setup split out to 65 and 66.

- [Desktop shell with the Tickets tree](issues/30-desktop-shell-with-tickets-tree.md): Electron shell and Tickets view over readTicketsTree, with file watching, remembered project and legend, Playwright smoke test.

- [Maps view and ticket/map tabs](issues/31-maps-view-and-ticket-map-tabs.md): Maps view with stacked progress bars and stats card, ticket and map editor tabs with a details header, persisted per project and live on disk edits, and one STATUS_META table.

- [Embedded terminal session](issues/32-embedded-terminal-session.md): PTYs in the main process behind a PtyProvider seam (node-pty), shown with xterm.js in session tabs; killed on quit; called terminals until a worktree Session exists.

- [Start work with Claude Code](issues/33-start-work-with-claude-code.md): Start with Claude Code creates or reuses the ticket's worktree and opens the CLI there with the next-step command typed one key at a time and never submitted, held back while a trust dialog shows; a declarative Agent adapter and a dryland launcher on the session PATH.

- [Live reporting and the live-events panel](issues/35-live-reporting-and-live-events-panel.md): dryland status and every mutating ticket/map command POST authenticated live events to the app's 127.0.0.1 listener found via a per-user lock file; the app refreshes on ticket.changed and shows events in a three-mode panel.

- [Claude Code session status](issues/36-claude-code-session-status.md): Claude Code is launched with --settings hooks (in Dryland's app dir) that call dryland status; verified against 2.1.300; the session state shows as a badge on its tab and ticket.

- [Tracker lock race behind the flaky parallel create test](issues/68-diagnose-the-flaky-parallel-ticket-create-test.md): A stale-lock breaker could remove a live lock; breakers now take turns and re-read before removing.

## Not yet specified

Nothing. The destination is reached: next is `/to-tickets` on the spec.

- Carried into the build as risks (see the spec's Further Notes): the Claude Code adapter is docs-only until its first implementation ticket verifies it.

## Out of scope

- Customized or modified Matt Pocock skill setups (would need AI-assisted adaptation); v1 targets defaults only.
- Teams, remote or cloud sessions, multi-user collaboration.
- Using Claude API / Agent SDK; forking Orca.
- Actually building the ADE.
- Updating Matt Pocock skills from the ADE (v1 only reports differences; decided in [write policy ticket](issues/13-write-policy-and-skill-setup.md)).

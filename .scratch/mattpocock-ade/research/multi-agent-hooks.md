# Multi-agent CLI hooks & status-detection research

Scope: new research only. Background on Orca's own architecture and on the official
Claude Code / Copilot CLI hook systems and flags already established in
`orca.md` and `agent-cli-observability.md` is referenced by filename, not
repeated.

---

## Part A — How other multi-agent-CLI orchestrators get live session status

### 1. Vibe Kanban — `BloopAI/vibe-kanban`

Repo confirmed (Rust + TypeScript monorepo, `crates/executors`, `crates/db`,
`crates/services`, `crates/local-deployment`).

- **(a) Hook install mechanism**: none. Vibe Kanban does not use Claude Code's
  or Copilot CLI's native hook systems at all. It drives Claude headlessly:
  `BloopAI/vibe-kanban:crates/executors/src/executors/claude.rs:190-191` passes
  `"--output-format=stream-json"` (also used for Claude slash-commands at
  `crates/executors/src/executors/claude/slash_commands.rs:203`). This is a
  non-interactive, one-shot "print" invocation (matching the `--print
  --output-format stream-json` headless lane already documented for Orca and
  Claude Code's own CLI flags in the prior research files), not an attached
  interactive PTY session with hooks firing against a live terminal.
- **(b) Does it write into the user's own CLI config?**: no evidence found of
  any write to `~/.claude/settings.json`, `~/.copilot/settings.json`, or
  `~/.copilot/hooks/`. Status/observability is derived entirely from parsing
  the executor subprocess's own structured `stream-json` stdout plus the
  subprocess's exit code — it never needs to register a hook anywhere.
- **(c) Heuristic for CLIs with no hook system**: Vibe Kanban's own execution
  model defines status from its own data, not from PTY ANSI scraping — status
  lives in `BloopAI/vibe-kanban:crates/db/src/models/execution_process.rs`
  as a first-class enum:
  ```rust
  pub enum ExecutionProcessStatus {
      Running,
      Completed,
      Failed,
      Killed,
  }
  ```
  (lines ~39-44 of that file). Because the agent CLI is run in `--print
  --output-format stream-json` mode rather than attached to an interactive
  PTY/terminal, Vibe Kanban can derive "running vs. waiting vs. done" from the
  structured JSON event stream and the OS process lifecycle rather than from
  scraping rendered terminal output — a different category from both "hooks"
  and "PTY ANSI heuristics."
- **(d) Cleanup**: not applicable — nothing is installed into any CLI's
  config, so there is nothing to clean up.

### 2. Conductor (conductor.build)

- **Not found / not verifiable as OSS.** `conductor.build` (fetched directly)
  is a commercial, closed-source macOS app ("Run parallel Claude Code, Codex,
  and Cursor agents in isolated workspaces on your Mac" —
  https://www.conductor.build/). GitHub repository search
  (`search_repositories`, query `conductor claude worktree orchestrator`)
  returned no matching `conductor`/`conductor.build` organization or
  repository; all hits were unrelated third-party projects that merely
  *mention* "Conductor" as a workflow name (e.g. `damian87x/jev-claude-orchestrator`,
  `HackubatorLLC/conductor-crescendo`), not the product itself. No source code
  is publicly inspectable, so Parts A(a)-(d) cannot be answered for this tool
  from a primary source. (Note: this is a different "Conductor" from the
  project-local permission-writing feature of the same name inside
  `asheshgoplani/agent-deck`, discussed under agent-deck below — a
  coincidental name collision the task description anticipated.)

### 3. claude-squad — `smtg-ai/claude-squad`

Repo confirmed (Go, uses `tmux` + a PTY, `session/tmux/tmux.go`,
`session/instance.go`).

- **(a) Hook install mechanism**: none exist. claude-squad never touches
  Claude Code's, Aider's, or Gemini CLI's own config/hook systems.
- **(b) Does it write into the user's own CLI config?**: no — there is
  nothing to write, since status comes entirely from polling rendered
  terminal content.
- **(c) Heuristic for CLIs with no hook system**: pure PTY/tmux
  pane-content heuristic. `smtg-ai/claude-squad:session/tmux/tmux.go:244-266`
  (`func (t *TmuxSession) HasUpdated() (updated bool, hasPrompt bool)`)
  captures the tmux pane content and:
  - computes a SHA-256 hash of the captured content and diffs it against the
    previous tick's hash to detect `updated`;
  - detects `hasPrompt` (i.e., "waiting for input") via **plain substring
    matching on known confirmation-prompt strings** rendered by each CLI,
    not a hook or structured signal:
    ```go
    if t.program == ProgramClaude {
        hasPrompt = strings.Contains(content, "No, and tell Claude what to do differently")
    } else if strings.HasPrefix(t.program, ProgramAider) {
        hasPrompt = strings.Contains(content, "(Y)es/(N)o/(D)on't ask again")
    } else if strings.HasPrefix(t.program, ProgramGemini) {
        hasPrompt = strings.Contains(content, "Yes, allow once")
    }
    ```
  - `smtg-ai/claude-squad:session/instance.go:337-341` wraps this as
    `(i *Instance) HasUpdated()`, called from the app's polling loop.
  This is a textbook instance of the "PTY ANSI/output pattern matching"
  category named in the task's Part A(c) — tied to literal English strings
  Claude Code (etc.) happen to render for a specific permission prompt, which
  would break silently on any upstream wording change.
- **(d) Cleanup**: not applicable — since nothing is ever installed into any
  CLI's config file, there is no install/uninstall lifecycle to manage.

### 4. Crystal / Nimbalyst — `stravu/crystal`

Repo confirmed as `stravu/crystal` (Electron app; `nimbalyst/nimbalyst` also
exists but a prior investigation pass found the actual implementation still
lives in `stravu/crystal` — see prior-session note; this pass did not find a
separate, independently-maintained `nimbalyst/nimbalyst` implementation to
cite beyond that).

- **(a) Hook install mechanism**: none found. Crystal drives Claude Code
  headlessly, analogous to Vibe Kanban. `stravu/crystal:main/src/services/panels/claude/claudeCodeManager.ts:65-72`
  (`buildCommandArgs`) builds:
  ```ts
  const args = ['--verbose', '--output-format', 'stream-json'];
  ```
  i.e., the same `--output-format stream-json` non-interactive/print-style
  invocation, with `--dangerously-skip-permissions` or an MCP-based approval
  channel layered on top (same file, lines ~85-95) rather than Claude Code's
  own hook system.
- **(b) Does it write into the user's own CLI config?**: no evidence found —
  no reference to `~/.claude/settings.json`, hook registration, or
  `CLAUDE_CONFIG_DIR` anywhere in the Claude panel manager searched.
- **(c) Heuristic for CLIs with no hook system**: status is derived from
  parsing the `stream-json` event stream and mapping it (plus DB/process
  state) into Crystal's own session-status model —
  `stravu/crystal:main/src/services/sessionManager.ts:213` references
  `this.mapDbStatusToSessionStatus(dbSession.status, dbSession.last_viewed_at, dbSession.updated_at)`,
  and the frontend checks a `status === 'running'` string
  (`stravu/crystal:frontend/src/components/panels/claude/ClaudeInputWithImages.tsx:227`).
  This is the same "structured JSON stream + process/DB state" category as
  Vibe Kanban, not PTY/ANSI scraping and not Claude's hook system.
- **(d) Cleanup**: not applicable for the same reason as Vibe Kanban — no
  config file is ever written into any CLI's own settings.
- **Caveat**: a prior pass in this investigation found a file literally named
  `claudeCodeManager.ts.backup` alongside the live `claudeCodeManager.ts`
  (both exist in the tree at the inspected commit). This report cites only
  the live, non-`.backup` file; the `.backup` file's purpose (stale backup vs.
  deliberate fallback) was not further resolved and should be treated as an
  unexplained artifact rather than evidence of a second, different mechanism.

### 5. agent-deck — `asheshgoplani/agent-deck`

Repo confirmed (Go).

- **(a) Hook install mechanism**: a genuine Claude Code hook installer,
  `InjectClaudeHooks(configDir)` in
  `asheshgoplani/agent-deck:internal/session/claude_hooks.go`, which merges
  managed hook entries into `<configDir>/settings.json`. `configDir` defaults
  to the user's real `~/.claude` directory (the CLI's ambient config root)
  unless the user has separately configured a non-default
  `CLAUDE_CONFIG_DIR` / profile / account slot.
- **(b) Does it write into the user's own CLI config?**: **yes, by default.**
  Unless the operator has pointed `CLAUDE_CONFIG_DIR` elsewhere, agent-deck's
  main status-hook installer writes straight into the user's real
  `~/.claude/settings.json`, exactly the kind of ambient mutation the ADE in
  this task must avoid. Notably, agent-deck *is* capable of writing
  project-local config when it chooses to: a separate, unrelated feature also
  named "conductor" inside agent-deck
  (`asheshgoplani/agent-deck:internal/session/conductor_claude_settings.go`,
  `WriteConductorClaudeSettings`) writes a scoped Bash permission allowlist
  into `<project-or-conductor-dir>/.claude/settings.json` (a project
  directory, not `~/.claude`) — but this writes *permissions*, not the
  status-observability hooks, and is architecturally distinct from the
  global hook installer. This demonstrates the project-local pattern is known
  to agent-deck's authors but was not applied to their hook-based status
  mechanism.
- **(c) Heuristic for CLIs with no hook system**: n/a for Claude Code
  specifically (it has a real hook install). Not separately investigated in
  this pass for agent-deck's handling of non-Claude CLIs.
- **(d) Cleanup / lifecycle management**: agent-deck is unusually careful
  here, but around *durability*, not removal: `HealClaudeHooks`
  (`asheshgoplani/agent-deck:internal/session/claude_hooks_heal.go`) re-pins
  the hook command to the current stable binary path on every daemon start,
  so upgrades of the agent-deck binary don't silently break the installed
  hook (with fallback heuristics for unpinnable dev builds). No explicit
  "uninstall on app removal" path was found in this investigation — the
  installed hook entries in `~/.claude/settings.json` appear to persist
  until manually removed, which should be flagged as a real, user-visible
  side effect outside agent-deck's own UI.

### 6. Emdash — `generalaction/emdash`

Repo confirmed (the real Emdash, YC W26 — distinguished in a prior pass from
unrelated same-named projects).

- **(a) Hook install mechanism**: a first-class, documented hook installer
  (`generalaction/emdash:packages/core/src/services/agent-plugins/node/hook-installer.ts`)
  with per-provider hook definitions
  (`packages/plugins/src/agents/impl/claude/hooks.ts`,
  `.../copilot/hooks.ts`), resolved through one of three config-root helpers
  in `packages/core/src/services/agent-plugins/api/plugins/helpers/config-root.ts`:
  `homeConfigRoot(dir)` (fixed `~/dir`), `envConfigRoot(envVar, fallbackDir)`
  (env override, e.g. `CLAUDE_CONFIG_DIR` for Claude or `COPILOT_HOME` for
  Copilot, else `~/fallbackDir`), and `xdgConfigRoot(...)` (XDG/APPDATA else
  home). All three resolve under the real user's home directory by default.
- **(b) Does it write into the user's own CLI config?**: **yes, explicitly
  and by design.** Emdash's own docs
  (`generalaction/emdash:agents/integrations/providers.md`, "Agent Hooks And
  Notifications" section) state: *"Shipped hook integrations install into
  user-global provider configuration, never into a task worktree."* A
  `scope: 'workspace'` capability exists in the plugin type system as an
  "extension escape hatch," but the docs state *"no built-in provider uses
  it."* This is the most explicit, self-documented confirmation among all
  surveyed tools that the built-in behavior is ambient/user-level, not
  project-local.
- **(c) Heuristic for CLIs with no hook system**: not separately
  characterized in this pass (Emdash's architecture centers on the hook
  system above for its supported providers).
- **(d) Cleanup**: Emdash's mitigation for the side-effect risk is *not*
  install/uninstall lifecycle management but a no-op guard: installed hook
  commands are designed to exit successfully (no-op) when the
  Emdash-specific hook-server environment variable/socket is absent, so a
  hook fired from a plain, non-Emdash CLI session is harmless but still
  present. No explicit "remove hooks on app uninstall" mechanism was found in
  the sources read in this pass (the docs file covering this was read, but
  no corresponding uninstall-hooks code path was located) — flagged under
  Unverified below.

### 7. cmux — `manaflow-ai/cmux`

Repo confirmed (Go daemon + remote CLI).

- **(a) Hook install mechanism**: an explicit, user-facing CLI subcommand,
  `cmux claude-hook install|uninstall [--settings-file <path>]`
  (`manaflow-ai/cmux:daemon/remote/cmd/cmuxd-remote/claude_hook_install.go`),
  which defaults to writing into `$CLAUDE_CONFIG_DIR/settings.json` or
  `~/.claude/settings.json` if no `--settings-file` is given.
- **(b) Does it write into the user's own CLI config?**: **yes, by
  default**, same as agent-deck and Emdash — unless the caller explicitly
  passes `--settings-file` to redirect it elsewhere. The code contains an
  explicit design-rationale comment (same file) that this is deliberate:
  launchers that pass their own `--settings`/`CLAUDE_CONFIG_DIR` for a single
  invocation *still* need cmux's hook entries present in the user settings
  file that Claude Code merges underneath, because (per cmux's own reasoning)
  a purely per-invocation settings file is not sufficient for their use case
  — directly relevant context for Part B/D below, though this is cmux's own
  design choice/assumption, not an independent confirmation of Claude Code's
  settings-merge behavior.
- **(c) Heuristic for CLIs with no hook system**: not separately
  characterized in this pass (cmux's primary mechanism for Claude is the hook
  installer above).
- **(d) Cleanup**: the most mechanically rigorous of the surveyed tools.
  Install/uninstall is fully idempotent via a stable marker string
  (`claudeHookInstallMarker`) tagging cmux's own entries, so `uninstall`
  removes exactly and only the entries cmux added (never touching
  user-authored hooks in the same file), and all writes are atomic
  (temp-file-then-rename, preserving the original file's mode bits). The
  installed hook commands are also designed as a no-op when the remote CLI
  binary is missing or invoked outside a cmux surface — the same mitigation
  pattern used by Emdash.

---

## Part B — Claude Code: `--settings` flag and `.claude/settings.local.json`

Primary sources: https://code.claude.com/docs/en/cli-reference and
https://code.claude.com/docs/en/settings (official docs, fetched directly).

**Does `--settings` exist, and does it avoid writing to `~/.claude/settings.json`?**

Yes. `code.claude.com/docs/en/settings` ("Change a setting for one session")
states, quoted verbatim:

> To try a value without saving it, set it when you start Claude Code. The
> value applies to that session and your settings files stay as they were.
> You have three ways to do it:
>
> * **`--settings`**: pass a key as JSON, inline or as a path to a file.
>   Claude Code applies it above your user, project, and local files and
>   below managed settings. It can set any key your user settings file can
>   set; it can't set `Managed` or `Global config` keys.

And gives the worked example:

```bash
claude --settings '{"model": "claude-opus-5-5"}'
```

The same page's settings-precedence diagram lists the five sources, highest
to lowest:

1. Managed settings (`managed-settings.json`, MDM, or the claude.ai console)
2. **Command line** — `claude --settings`
3. Project local — `.claude/settings.local.json`
4. Shared project — `.claude/settings.json`
5. User — `~/.claude/settings.json`

Because `--settings` "can set any key your user settings file can set," and
`hooks` is an ordinary user-settings key, this means a wrapper process (the
ADE) can pass `--settings '{"hooks": {...}}'` or `--settings <path-to-an-ADE-owned-json-file>`
for a single Claude Code invocation and have those hooks take effect for that
session **without writing anything to `~/.claude/settings.json`, `.claude/settings.json`,
or `.claude/settings.local.json`** — this is the cleanest, most surgical
no-user-config-write path of everything surveyed in this report, confirmed
directly from the primary docs.

Also confirmed from the CLI reference
(https://code.claude.com/docs/en/cli-reference): the `claude agents` command
(for background/parallel sessions) explicitly documents accepting
`--settings` "like the top-level `claude` command," so the flag is not
limited to interactive single-session launches.

**Is `.claude/settings.local.json` sufficient on its own, with zero writes to `~/.claude/settings.json`?**

Yes, for a session whose `cwd` (or git-repo root, see caveat below) is the
project directory. `code.claude.com/docs/en/settings` states project-local
settings are scoped purely to that project:

> **Project local** | `.claude/settings.local.json` | You, in this one
> project only.

and under "Compare the scope of each settings file":

> **`acme-app/.claude/settings.local.json`**: your `acme-app/` only.

There is nothing in the precedence/scope model that requires or implies any
write to the user-level file — `.claude/settings.local.json` is read
independently of whether `~/.claude/settings.json` exists at all. One
**caveat worth flagging for the ADE's worktree model**: the same page states
that for *permission-approval writes* specifically (not for hooks a human
pre-authors), "If you start Claude Code in a subdirectory of a git
repository, it reads and writes that file **at the repository root**... In a
[worktree], it uses the file at the main checkout's root" — i.e., if Claude
Code itself is the one deciding where to *write* a new `settings.local.json`
(e.g., after a user says "don't ask again"), it resolves to the **main
checkout's root**, not the worktree's own directory. This is specifically
about Claude Code's own write-target resolution for permission approvals;
it does not change the *read* behavior for a hooks config that the ADE
pre-populates into the worktree's own `.claude/settings.local.json` before
launch — but it does mean an ADE relying on Claude Code to *organically*
write its own project-local settings file inside a worktree should not
assume the file lands in the worktree itself. Pre-writing the file into the
worktree before launch (which is squarely within the ADE's own control, as
opposed to waiting for Claude Code to write it) sidesteps this caveat
entirely and was not contradicted by anything in the docs.

---

## Part C — GitHub Copilot CLI: hooks-dir override and worktree resolution

Primary sources (all fetched directly, docs.github.com):
- https://docs.github.com/en/copilot/concepts/agents/hooks
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks

**Is there a per-launch flag/env var that redirects just the hooks directory
(without moving the whole `~/.copilot` config root)?**

**No such surgical override was found.** The hooks-reference page's
authoritative "Hooks locations" list for Copilot CLI is, quoted verbatim
(https://docs.github.com/en/copilot/reference/hooks-reference):

> Hooks are loaded from the following sources in order (policy, then user,
> then project, then plugins) and combined... :
> * **Policy-level hook files** — JSON files in the platform-appropriate
>   policy directory...
> * **Repository-level hook files** — `.github/hooks/*.json` in the
>   repository root.
> * **User-level hook files** — `*.json` files in the user-level hooks
>   directory. By default this is `~/.copilot/hooks/` on macOS and Linux, or
>   `%USERPROFILE%\.copilot\hooks\` on Windows. If `COPILOT_HOME` is set, it
>   is `$COPILOT_HOME/hooks/`.
> * **Inline `hooks` block in repository settings** — the `hooks` field at
>   the top level of `.github/copilot/settings.json` (Git committed) or
>   `.github/copilot/settings.local.json` (typically gitignored and user
>   specific) in the repository. Cross-tool `.claude/settings.json` and
>   `.claude/settings.local.json` files in the repository are also read.
> * **Inline `hooks` block in user-level config** — the `hooks` field at the
>   top level of `~/.copilot/settings.json`.
> * **Hooks contributed by installed plugins**...

There is no `--hooks-dir` flag, no dedicated `COPILOT_HOOKS_DIR`-style
variable, and no `XDG_CONFIG_HOME`-style override mentioned anywhere in the
CLI command reference or config-dir reference pages. The only override
affecting user-level hooks is **`COPILOT_HOME`**, documented on the
config-dir reference page:

> By default, this directory is `~/.copilot` (that is, `$HOME/.copilot`)...
> You can change the location of this directory by setting the
> `COPILOT_HOME` environment variable to a different path.

`COPILOT_HOME` is confirmed to move the hooks directory specifically too
(the use-hooks how-to repeats, for both the macOS and Windows worked
examples: *"If `COPILOT_HOME` is set, create the file in `$COPILOT_HOME/hooks/`"* /
`%COPILOT_HOME%\hooks\`). But `COPILOT_HOME` is a **whole-home-directory
swap**, not a hooks-only override: per the directory-overview table on the
same page, it also relocates `settings.json`, `config.json`
(auth/installed-plugins state), `session-state/`, `logs/`, `mcp-config.json`,
`agents/`, `skills/`, etc. — i.e., using it to avoid touching the real
`~/.copilot/hooks/` means giving the ADE's Copilot CLI invocation an entirely
separate identity/config root (comparable in spirit to Claude Code's
`CLAUDE_CONFIG_DIR`, which is already documented in
`agent-cli-observability.md`), not a narrow per-launch hooks override. This
should count as a documented but non-surgical option, distinct from what the
task asked for ("without writing into `~/.copilot/hooks/` or
`~/.copilot/settings.json`" while implicitly still using the rest of the
user's real Copilot identity/config) — flagged explicitly rather than
treated as a clean match.

**Does `.github/hooks/*.json` resolve relative to the actual `cwd`/repo root
(so it would work inside an ADE-created git worktree), or some fixed
location?**

The docs consistently describe this as resolving to **"the repository
root"**, not a fixed/absolute path:
- `docs.github.com/en/copilot/concepts/agents/hooks`: *"You define hooks in
  JSON files, stored in your repository at `.github/hooks/*.json`. These
  apply whenever Copilot agents are used in the repository."*
- `docs.github.com/en/copilot/reference/hooks-reference`: *"Repository-level
  hook files — `.github/hooks/*.json` **in the repository root**."*

Neither page explicitly discusses git worktrees (multiple working trees
sharing one `.git` database, each with its own independent top-level/root
directory and its own checked-out file tree) or clarifies whether "repository
root" is resolved via something equivalent to `git rev-parse --show-toplevel`
(which, under ordinary git semantics, returns the *current* worktree's own
root, not the main checkout's) or via some other fixed/primary-checkout
notion. **This specific worktree-resolution question is therefore not
explicitly confirmed by Copilot's docs and should be treated as unverified**
— the most defensible reading, based on ordinary git behavior and the docs'
plain "in the repository root" wording (with no mention of a separate
"primary checkout" concept the way Claude Code's settings docs explicitly
call out for permission-approval writes, see Part B), is that Copilot CLI
would read `.github/hooks/*.json` from wherever its own `cwd`-relative
repository-root resolution lands when launched inside an ADE worktree — i.e.
the worktree's own `.github/hooks/`. But this is an inference from general
git semantics and the absence of any worktree caveat in Copilot's docs
(unlike Claude Code's settings docs, which do call out worktree behavior
explicitly for one specific scenario), not a directly quoted confirmation,
and is flagged as such below.

---

## Part D — Synthesis (own analysis, not a primary source)

- For **Claude Code**, the cleanest no-user-config-write path confirmed
  directly from official docs is the **`--settings` CLI flag**
  (`claude --settings <path-or-inline-json>`): it is explicitly a
  per-invocation override, sits above the project/local/user settings files
  in precedence, can carry a `hooks` block, and the docs explicitly promise
  "your settings files stay as they were." This is a stronger guarantee than
  `.claude/settings.local.json`, which is still a real file on disk that
  Claude Code itself may also write into (for permission approvals) — though
  for an ADE that pre-populates the file itself and never relies on Claude
  Code to create it, that's a non-issue. Either `--settings` or a
  pre-written worktree-local `.claude/settings.local.json` should satisfy the
  ADE's "no user-level config write" constraint for Claude Code; `--settings`
  is the more surgical/cleaner of the two since it touches no filesystem
  state at all.
- Worth noting as a design counterpoint: **cmux explicitly chose not to rely
  on a per-invocation `--settings`/`CLAUDE_CONFIG_DIR` override** and instead
  writes into the user's real `~/.claude/settings.json` by default, with an
  explicit code comment asserting this is necessary for their use case. That
  is cmux's own design assumption/rationale, not an independently verified
  limitation of `--settings` from Anthropic's own docs — this report did not
  find anything in Claude Code's official docs contradicting that
  `--settings` should work standalone for hooks, so treat cmux's stated
  rationale as an unverified claim about Claude Code's actual behavior, worth
  the ADE independently smoke-testing before relying on `--settings` alone.
- For **GitHub Copilot CLI**, the only documented no-user-config-write path
  is **repo-level `.github/hooks/*.json`** committed/present inside the
  worktree's own file tree. No per-launch flag or env var exists to retarget
  just the hooks directory; the only override (`COPILOT_HOME`) swaps the
  *entire* `~/.copilot` identity/config root, which is a much bigger
  behavioral change than "hooks only" and would also need its own separate
  evaluation (e.g., it would also change where auth tokens, MCP config, and
  skills are read from) if the ADE wanted to use it instead.
- The worktree-resolution question for Copilot's `.github/hooks/*.json`
  (does "repository root" mean the specific worktree's own root, as ordinary
  git semantics would suggest, or some other fixed/main-checkout location)
  is **not explicitly confirmed** in Copilot's docs and should be verified
  empirically by the ADE team (e.g., by creating a worktree with a
  worktree-only `.github/hooks/*.json` not present in the main checkout, and
  confirming the hook fires) before relying on it — see Part C and
  "Unverified" below.
- Across the Part A survey, the **dominant pattern among small OSS
  multi-agent orchestrators that do use Claude Code's native hook system**
  (agent-deck, Emdash, cmux) is to write into the user's real, ambient
  `~/.claude/settings.json` (or an env-overridable equivalent) **by
  default**, mitigating the "affects the user's own unmodified CLI sessions"
  risk only with idempotent/marker-tagged installs and no-op guards — not
  with the project-local/per-invocation mechanisms Claude Code's own docs
  make available. None of the three fully avoids ambient writes by default.
  This suggests the ADE's planned approach (worktree-local, no ambient
  writes) is **more conservative than the prevailing practice** in this
  space, not a widely-proven pattern already validated by a peer tool.
- The tools that avoid touching any CLI's native hook/config system
  entirely (Vibe Kanban, Crystal) do so by **not using an interactive PTY
  session at all** for status purposes — they drive the agent CLI in a
  headless, one-shot `--output-format stream-json` "print" mode and derive
  status from the structured JSON stream plus OS process state. That is a
  fundamentally different approach from the ADE's PTY-based model (per
  `orca.md`) and trades away true interactive, resumable sessions — not a
  drop-in technique, but worth noting as the only approach among the
  surveyed tools that structurally cannot leak into the user's other CLI
  sessions, precisely because it foregoes native hooks and PTYs alike.
- claude-squad's tmux-pane-content/string-matching heuristic is the one
  concrete example found of the "PTY ANSI/output pattern matching" fallback
  named in the task description, and it is fragile by construction (tied to
  literal, versioned English prompt strings) — useful as a worked precedent
  if the ADE ever needs a fallback for a CLI with no hook system, but not
  something to emulate as a primary mechanism where a real hook system
  (Claude Code, Copilot CLI) is available.

---

## Unverified / not found

- **Conductor (conductor.build)**: confirmed to be closed-source; no public
  GitHub repository could be found or verified. All Parts A(a)-(d) questions
  are unanswerable from a primary source for this tool.
- **Crystal's `claudeCodeManager.ts.backup` file**: found to exist alongside
  the live `claudeCodeManager.ts` in `stravu/crystal` at the inspected
  commit; its purpose (stale leftover vs. deliberate fallback/alternate
  implementation) was not resolved, and this report cites only the live file.
- **Nimbalyst as an independently-verified, separate codebase from
  `stravu/crystal`**: not confirmed in this pass; treated as the same
  underlying implementation per the prior research session's finding.
- **Emdash's cleanup/uninstall behavior**: no explicit "remove hooks on app
  uninstall" code path or documented command was located in the sources read
  (`providers.md` and the hook-installer/config-root TypeScript files);
  Emdash's documented mitigation is a runtime no-op guard, not a
  install/uninstall lifecycle, but this is not a confirmed *absence* of any
  uninstall path — only an absence of one found in the files inspected during
  this research pass.
- **agent-deck's cleanup/uninstall behavior**: likewise, no explicit
  "uninstall" or "remove our hooks" code path was located for the Claude
  global-hook installer (`InjectClaudeHooks`); only the self-healing/re-pin
  behavior (`HealClaudeHooks`) was confirmed. Whether agent-deck provides any
  user-facing command to cleanly remove its injected hooks from
  `~/.claude/settings.json` was not confirmed either way.
- **Copilot CLI `.github/hooks/*.json` resolution inside a git worktree**:
  Copilot's official docs say hooks load from `.github/hooks/*.json` "in the
  repository root" but never explicitly discuss git worktrees or confirm
  whether "repository root" resolves per-worktree (as ordinary git semantics
  would suggest) or to some other fixed/main-checkout notion. Treated in
  Part C/D as a reasonable inference from general git behavior and the
  absence of any contrary caveat in the docs, not a directly quoted/confirmed
  fact — recommend the ADE verify this empirically before relying on it.
- **cmux's stated rationale for why a per-invocation `--settings`/
  `CLAUDE_CONFIG_DIR` override is supposedly insufficient** for their use
  case (a design comment in their own source, not a claim sourced from
  Anthropic's docs): this report found nothing in Claude Code's own
  documentation that corroborates or contradicts that specific claim; flagged
  as an unverified third-party assumption rather than a confirmed limitation
  of `--settings`.

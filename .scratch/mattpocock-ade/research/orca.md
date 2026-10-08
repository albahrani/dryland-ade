# Research: stablyai/orca

**Repo:** https://github.com/stablyai/orca
**Default branch:** `main`
**Commit SHA used for all citations:** `7c50009ca4946cf7384495f542d0b5856308b70c` (HEAD of `main` at research time, 2026-10-08)
**License:** MIT (see Q5)
**Stars/forks at research time:** 87,581 stars / 5,605 forks (per GitHub API `search_repositories`, not a file — noted as metadata, not a source-code claim)

All citations below use the form `stablyai/orca:path:line-range` plus a GitHub blob URL built from the commit SHA above. Where a cited file was read via the GitHub API without explicit line numbers (whole small file), the citation covers the file as fetched; this is marked **[whole file]**.

---

## Repository orientation: is this a monorepo?

Yes — multiple apps/packages exist side by side in one repository root:

- **`src/`** — the Electron desktop app (main process, preload, renderer, relay client code, shared code, CLI). This is the primary "Orca" product. Top-level dirs: `src/cli`, `src/main`, `src/preload`, `src/relay`, `src/renderer`, `src/shared`, `src/types`.
  ([stablyai/orca:src](https://github.com/stablyai/orca/tree/7c50009ca4946cf7384495f542d0b5856308b70c/src))
- **`native/`** — platform-native Node addons / helper binaries: `computer-use-linux`, `computer-use-macos`, `computer-use-windows`, `keyboard-layout-macos`, `notification-status-macos`, `windows-cli-launcher` (Rust), `windows-registry`.
  ([stablyai/orca:native](https://github.com/stablyai/orca/tree/7c50009ca4946cf7384495f542d0b5856308b70c/native))
- **`cloud/`** — an independent pnpm workspace for the mobile-pairing relay infrastructure (`apps/relay`, `apps/relay-fence-broker`, `apps/relay-ops`, `apps/push`, `packages/relay-contract`, `packages/push-contract`, Terraform under `infra/`). Has its own `pnpm-workspace.yaml`/`pnpm-lock.yaml`.
  ([stablyai/orca:cloud/README.md](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/cloud/README.md))
- **`mobile/`** — a separate Expo/React Native app (the "mobile companion").
  (listed at repo root; `mobile/package.json` confirms Expo 55 / React Native 0.83 — see Q5)
- **`config/`, `docs/`, `resources/`, `skills/`, `skill-guides/`, `skill-stubs/`, `examples/`, `tests/`** — build scripts/patches, documentation (including audit write-ups and a public style guide), app resources/icons, bundled "skills" content, and test fixtures.
- Root uses **pnpm workspaces** (`pnpm-workspace.yaml`, `pnpm-lock.yaml`) for the desktop app; `cloud/` and `mobile/` are separate package trees with their own lockfiles/scripts.

Root listing citation: [stablyai/orca:/ (root tree)](https://github.com/stablyai/orca/tree/7c50009ca4946cf7384495f542d0b5856308b70c)

---

## Q1: How does Orca run Claude Code (and other CLIs) under the user's own login, without the Claude API/SDK calling out directly as a hosted service?

**Verified from source.** Orca uses two distinct execution strategies depending on the CLI and the UI surface:

### A. Generic terminal-agent spawning — a real PTY running the user's own CLI binary

For the vast majority of supported CLIs (Codex, Gemini, OpenCode, Copilot CLI, Cursor, etc.), and for Claude Code when shown as an ordinary terminal pane, Orca spawns the **actual CLI executable installed and authenticated by the user** inside a pseudo-terminal, using **`node-pty`** (`"node-pty": "^1.1.0"` in `package.json`). This is not an API call — it's the same binary + same login the user would get running the CLI themselves in a terminal.

- `LocalPtyProvider` implements `IPtyProvider` and wraps `node-pty`'s `IPty` for spawn/write/resize/shutdown:
  [stablyai/orca:src/main/providers/local-pty-provider.ts:1-96](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/providers/local-pty-provider.ts)
- Windows PTYs go through ConPTY; Orca patches/bundles `node-pty`'s conpty teardown and pre-warms it at daemon boot for performance (`useConptyDll: true`):
  [stablyai/orca:src/main/daemon/windows-conpty-warmup.ts:1-51](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/daemon/windows-conpty-warmup.ts)
- `src/shared/pty-owner-backend.ts` defines the three PTY "owner backends" Orca models: `'posix-pty' | 'windows-conpty' | 'windows-wsl'` (per lexical search; file not fully re-quoted here).
- Prompt text is injected into the CLI's own TUI via one of several `promptInjectionMode`s per agent (argv, stdin-after-start, flag-prompt, etc.) — see `TUI_AGENT_CONFIG` in Q2.

Because the child process *is* the user's own `claude`, `codex`, `copilot`, etc. binary, launched with the user's normal environment/PATH, it authenticates however that CLI normally does (OAuth/device-code login, stored credentials, etc.) — Orca never substitutes its own API key or calls Anthropic's/OpenAI's HTTP APIs for these sessions.

### B. Claude Code "structured" sessions — via `@anthropic-ai/claude-agent-sdk`, but spawning the user's CLI, not calling the API

For Orca's richer/structured Claude integration (the "native chat" / background-tasks UI, not just a raw terminal), Orca depends on `@anthropic-ai/claude-agent-sdk` (`package.json`: `"@anthropic-ai/claude-agent-sdk": "0.3.284"`). Critically, Orca does **not** let this SDK use its bundled/API-based transport. Instead:

1. It resolves the **user's own installed Claude Code executable** path (`pathToClaudeCodeExecutable`) and passes it to the SDK, explicitly noting the SDK's own bundled binary "is not installed":
   [stablyai/orca:src/main/claude/claude-stream-json-connection.ts:51-56](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/claude/claude-stream-json-connection.ts)
2. It overrides the SDK's `spawnClaudeCodeProcess` hook with its own spawner (`createClaudeCodeProcessSpawn`), so Orca — not the SDK — owns the child process, its pid, and its exit/teardown ladder. The comment states this explicitly: *"Orca supplies the Claude Code child rather than letting the SDK spawn it... the SDK's `SpawnedProcess` has no pid, and Orca's spawner is the only path that encodes `.cmd` arguments safely on Windows... On POSIX Claude runs under the provider supervisor... Windows has no supervisor and spawns Claude directly."*
   [stablyai/orca:src/main/claude/claude-agent-sdk-process-spawn.ts:1-82](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/claude/claude-agent-sdk-process-spawn.ts)
3. The SDK is told to run Claude in **`--print`/`-p` + `--output-format stream-json`** mode under the hood (headless, structured JSON-lines protocol over the child's stdio) rather than spawning the interactive TUI. Evidence of this contract: `PRINT_MODE_FLAGS = new Set(['--print', '-p'])` and references to the `stream-json` format throughout `src/shared`:
   [stablyai/orca:src/shared/print-mode-headless-command.ts:1-22](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/print-mode-headless-command.ts)
   [stablyai/orca:src/shared/claude-model-list-probe.ts:1-20](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/claude-model-list-probe.ts)
4. `openClaudeStreamJsonConnection` then talks to this child over the SDK's async-iterator message stream (`for await` over `session`), forwarding structured messages (`onMessage`), permission prompts (`canUseTool` → `--permission-prompt-tool stdio`), and dialogs (`onUserDialog`), and implements its own exit-proof/process-tree-reaping logic rather than trusting the SDK's own abort path:
   [stablyai/orca:src/main/claude/claude-stream-json-connection.ts:118-330](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/claude/claude-stream-json-connection.ts)
5. Env handling explicitly strips ambient `ANTHROPIC_*`/`CLAUDE_CONFIG_DIR` leakage and never omits `env` to the SDK, "exactly the ambient ANTHROPIC_* auth leak this lane already shipped once" — i.e. Orca is careful *not* to inject its own API credentials, relying instead on whatever the user's local Claude Code install already authenticates as:
   [stablyai/orca:src/main/claude/claude-stream-json-connection.ts:143-152](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/claude/claude-stream-json-connection.ts)

An internal audit doc corroborates the `stream-json` plumbing and names the installed SDK version precisely (`0.3.251`/`v1.4.198` observed in the field) and confirms `claude-stream-json-connection.ts` forwards SDK messages to Orca's own "structured adapter":
[stablyai/orca:docs/audits/claude-task-retention/README.md](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/docs/audits/claude-task-retention/README.md) **[whole file]**

### C. Claude Code hooks for status tracking (not for running the agent)

Separately from process spawning, Orca installs **Claude Code's native hooks** (writing to `~/.claude/settings.json`, or a profile-specific config dir) to get lifecycle events (tool-use, stop, etc.) out of a *manually run* or externally running Claude session, without needing a PTY/SDK connection at all. `ClaudeHookService.install()` reads the existing `hooks` config, merges in a managed hook invoking Orca's managed script, and writes a managed status-line script too:
[stablyai/orca:src/main/claude/hook-service.ts:1-230](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/claude/hook-service.ts)
The same pattern (its own `hook-service.ts`) exists for Gemini, Muse, and GitHub Copilot CLI (`src/main/gemini/hook-service.ts`, `src/main/muse/hook-service.ts`, `src/main/copilot/hook-service.ts`), confirmed via lexical search over `src/main/*/hook-service.ts`.

**Summary of the mechanism for Q1:** Orca never embeds an Anthropic/OpenAI API key or calls their hosted chat-completion APIs for these CLI agents. It (a) spawns the real locally-installed CLI binary in a `node-pty` pseudo-terminal for ordinary interactive use, so the CLI's own existing OAuth/subscription login is what authenticates; and (b) for Claude specifically, additionally offers a "structured" mode built on the official `@anthropic-ai/claude-agent-sdk`, but with the SDK's own process-spawning and binary resolution overridden so it still launches the user's own `claude` executable in headless `--print --output-format stream-json` mode rather than using the SDK's HTTP/API transport. Claude Code's own hook mechanism (`settings.json` hooks) is used independently to observe session status.

**Inference vs. verified:** The architecture, flags (`--print`, `stream-json`), spawn-override rationale, and "runs under the user's own install, not Orca's key" intent are all **verified directly from source comments and code** cited above. The exact wire format Claude's CLI uses for `stream-json` control messages (schema details) is only partially visible (`claude-stream-json-frame-schema.ts` exists but was not opened); treat the full message schema as **not fully verified** (file located but not read in depth).

---

## Q2: Which agent CLIs does Orca support, and what is the adapter abstraction?

### Supported CLIs (from source, not just marketing copy)

The authoritative, closed list is the `TuiAgent` union type — "All AI coding agents Orca knows how to launch":

[stablyai/orca:src/shared/tui-agent.ts](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/tui-agent.ts) **[whole file, 46 entries]**

It includes (ids as declared): `claude`, `claude-agent-teams`, `codebuddy`, `openclaude`, `codex`, `autohand`, `opencode`, `opencode2`, `mimo-code`, `pi`, `omp`, `qoder`, `qoder-cn`, `gemini`, `antigravity`, `aider`, `goose`, `amp`, `kilo`, `kiro`, `crush`, `aug` (Augment/Auggie), `cline`, `codebuff`, `freebuff`, `command-code`, `continue`, `cursor`, `droid` (Factory), `kimi`, `mistral-vibe`, `qwen-code`, `rovo` (Atlassian Rovo Dev), `hermes`, `openclaw`, **`copilot` (GitHub Copilot CLI)**, `grok`, `devin`, `ante`, `trae`, `muse` (Meta), `zcode` (Z.ai), `prime-agent`, `dsh` (DeepSeek Harness), `jcode`.

**Important correction to the research brief's premise:** GitHub Copilot CLI is **already supported**, not hypothetical. There is a dedicated `src/main/copilot/` module with `hook-service.ts`, `copilot-managed-hook-definitions.ts`, `copilot-managed-script.ts`, and `copilot-remote-hook-install.ts`:
[stablyai/orca:src/main/copilot (directory listing)](https://github.com/stablyai/orca/tree/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/copilot)
and its entry in the central config table (`detectCmd: 'copilot'`, `promptInjectionMode: 'flag-interactive'`, `preflightTrust: 'copilot'`):
[stablyai/orca:src/shared/tui-agent-config.ts:280-287](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/tui-agent-config.ts)

### The adapter abstraction

Rather than one class/interface per CLI, Orca's primary "adapter" is a **declarative config object per agent**, `TuiAgentConfig`, keyed by `TuiAgent` id in a single big table `TUI_AGENT_CONFIG_SOURCE: Record<TuiAgent, TuiAgentConfigSource>`:

[stablyai/orca:src/shared/tui-agent-config.ts:1-27](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/tui-agent-config.ts) (type/table header)
[stablyai/orca:src/shared/tui-agent-config.ts:280-310](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/tui-agent-config.ts) (the `copilot` entry, representative of the shape)

Each entry declares (fields observed across many agents in that file):
- `detectCmd` / `detectCmdAliases` / `detectRequiredCommands` — how Orca recognizes the CLI is installed/running in the foreground of a pane.
- `launchCmd` (defaults to `detectCmd`) / `launchCmdByPlatform` — the actual command line used to start it (e.g. Kiro: `'kiro-cli chat --tui'`; Rovo: `'acli rovodev run'`).
- `expectedProcess` — process name to match against (some CLIs rename their process, e.g. ZCode → `zcode-cli`).
- `promptInjectionMode` — one of `'argv' | 'stdin-after-start' | 'flag-prompt' | 'flag-prompt-interactive' | 'flag-interactive' | 'hermes-query' | ...` — how Orca delivers the initial prompt text into that CLI's particular TUI/CLI contract.
- `preflightTrust` — pre-writes a CLI-specific trust marker file so first-launch "do you trust this workspace" menus don't swallow the first paste.
- CLI-quirk fields: `draftPromptFlag`, `draftPromptEnvVar`, `draftPasteReadySignal`/`submitPasteReadySignal` (regex/heuristics on PTY output to know the composer is ready), `windowsShiftEnterEncoding`/`ctrlEnterEncoding` (CSI-u vs legacy Esc+CR for Shift/Ctrl+Enter on Windows), `argvPromptSeparator`, `submitRetryDelayMs`, `composerReadyCaptures` (named recorded PTY fixtures used in tests).

`resolveAgentLaunchCommand()` is the function that turns a `TuiAgent` + overrides + session options into the final shell command string to spawn in the PTY:
[stablyai/orca:src/shared/tui-agent-launch-command.ts:1-40](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/tui-agent-launch-command.ts)

A second, smaller per-agent extension point exists for **headless one-shot detection** (recognizing when a typed command is actually a non-interactive "print and exit" invocation, e.g. `claude -p "..."`), implemented as a lookup table of per-agent matcher functions, explicitly commented as "a table (not an if-chain) so adding an agent is one entry":
[stablyai/orca:src/shared/agent-headless-command.ts:1-46](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/agent-headless-command.ts)

A third, optional extension point is the **hook-service pattern** (`src/main/claude/hook-service.ts`, `src/main/gemini/hook-service.ts`, `src/main/muse/hook-service.ts`, `src/main/copilot/hook-service.ts`) for CLIs that expose their own hook/settings mechanism, used to get idle/running/done status without needing a live PTY parse. `pi` instead integrates via an extension mechanism noted in-line: *"pi has no settings.json hook surface — its extensibility is the..."*
(`stablyai/orca:src/main/pi/agent-status-extension-source.ts:2-5`, per lexical search; not opened in full).

### How reusable/pluggable is this for a new CLI (e.g. hypothetically adding one not yet supported)?

Based on the above, adding a new terminal-driven agent CLI to Orca's architecture looks like:
1. Add a new string literal to the `TuiAgent` union (`src/shared/tui-agent.ts`).
2. Add one entry to `TUI_AGENT_CONFIG_SOURCE` (`src/shared/tui-agent-config.ts`) describing detect command, launch command, and prompt-injection behavior — this is genuinely table-driven and documented as "Extend this union as new agents are added."
3. Optionally add an entry to `HEADLESS_ONE_SHOT_MATCHERS` if the CLI has a `--print`-style one-shot mode that must be excluded from "interactive pane" detection.
4. Optionally add a `src/main/<agent>/hook-service.ts` if the CLI exposes its own hook/settings file for status tracking (not required — most agents listed above have no such module and rely on PTY-output heuristics alone via `draftPasteReadySignal`/`composerReadyCaptures` fixtures).

This is a genuinely data-driven, pluggable design for the common case (an interactive TUI driven by a PTY), with escape hatches (hook services, SDK-level wrappers) only for the few CLIs — so far just Claude — that get a deeper, structured, non-PTY integration. **This assessment of "how reusable" is partly inference** from the shape of the code (comment "Extend this union as new agents are added" is verified; the generalized claim about effort-to-add is the author's synthesis, not a line from the repo).

---

## Q3: Worktree/branch management for parallel sessions

**Verified from source.**

### Naming

- **Sanitization:** A user-entered workspace name is slugified via `sanitizeWorktreeName()` — keeps Unicode letters/numbers, collapses unsafe runs to `-`, collapses `..` (because `git check-ref-format` forbids it), strips leading/trailing `.`/`-`:
  [stablyai/orca:src/main/ipc/worktree-logic.ts:36-65](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/ipc/worktree-logic.ts)
- A parallel renderer-facing slugifier, `slugifyForWorkspaceName()`, additionally lower-cases, truncates to 48 chars, and is also used to seed names from PR/issue titles and prompt text (`getWorkspaceIntentName`, `getLinkedWorkItemWorkspaceName`, `getLinearIssueWorkspaceName`):
  [stablyai/orca:src/shared/workspace-name.ts:23-37](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/shared/workspace-name.ts)
- **Branch prefix** is configurable (not a hardcoded `orca/` prefix): a settings-driven strategy (`BranchPrefixSettings`) can prepend nothing, the git username, or a custom string like `team/`; `computeBranchName()` = `${prefix}/${sanitizedName}` or just `sanitizedName` if no prefix:
  [stablyai/orca:src/main/ipc/worktree-branch-name.ts:1-60](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/ipc/worktree-branch-name.ts)
- **Folder placement:** `computeWorktreePath()` resolves a workspace root (user-configured `workspaceDir`, optionally nested per-repo via `nestWorkspaces`) and joins `[workspaceRoot]/[repoName]/[sanitizedName]` or `[workspaceRoot]/[sanitizedName]`. A special case mirrors the workspace root onto the WSL filesystem (`~/orca/workspaces` inside the distro) when the repo's git runs inside WSL, because cross-filesystem `git status`/`git worktree add` on a 9p mount was measured ~20–26x slower:
  [stablyai/orca:src/main/ipc/worktree-logic.ts:95-205](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/ipc/worktree-logic.ts)

### Creation / cleanup

- Setup scripts (per-worktree `orca.yaml` hooks) are written to the real per-worktree gitdir via `git rev-parse --git-path` at `orca/setup-runner.sh` (POSIX) or `orca/setup-runner.cmd` (native Windows), with WSL-path and Git-Bash-path translation handled explicitly:
  [stablyai/orca:src/main/worktree-runner-script.ts:1-140](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/worktree-runner-script.ts)
- Removal/cleanup logic distinguishes orphaned worktrees (`git worktree prune`'d but directory still present: `isOrphanedWorktreeError` matching `/is not a working tree/`), Windows long-path removal failures, and generic preflight errors (`isOrphanCompatiblePreflightError`):
  [stablyai/orca:src/main/ipc/worktree-logic.ts:260-318](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/ipc/worktree-logic.ts)
- Dedicated modules exist for safety-critical removal paths: `src/main/worktree-removal-home-guard.ts` (never removes if the resolved path collapses to `$HOME`), `src/main/ipc/worktrees/ipc-context.ts`'s `createWorktreeRemovalRegistry()` (tracks in-flight removals), and `src/main/runtime/forced-sweep-settlement.ts`'s sweep tracker (per lexical search; not all opened in full — **partially verified**, names/purpose inferred from file/function names and surrounding search snippets rather than full file reads).

### Conflict avoidance between concurrent sessions

Verified via a unit test exercising the real conflict path: when a requested branch name or worktree folder name collides with an existing one (including on an SSH/remote host), Orca **suffixes with `-2`, `-3`, ...** before calling `git worktree add`, e.g. requesting branch `feature/something` when `feature/something` already exists remotely results in actually creating `feature/something-2` at `/remote/repo-feature-something-2`:
[stablyai/orca:src/main/ipc/worktrees-ssh-branch-conflict-suffixing.test.ts:195-260](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/ipc/worktrees-ssh-branch-conflict-suffixing.test.ts)

This confirms the general mechanism (collision → numeric suffix) but the exact production function that performs the suffixing (as opposed to the test exercising it through the IPC handler `worktrees:create`) was not directly opened; **the suffixing algorithm's implementation file was not located/read — treat the exact suffix-selection logic as inferred from test behavior, not directly cited from implementation source.**

---

## Q4: Terminal embedding/rendering — PTY library, Windows vs. Unix, terminal UI component

**Verified from source — this is one of the best-evidenced areas.**

### PTY library

- **`node-pty`** (`"node-pty": "^1.1.0"` in root `package.json`). Orca carries two first-party patches applied to the vendored copy, shipped under `config/relay-assets/`:
  - `node-pty-1.1.0-console-list-agent-patch.cjs` — works around `AttachConsole` failing without a Win32 console.
  - `node-pty-1.1.0-windows-pty-teardown-patch.cjs` — "Release the ConPTY teardown handles a relay's npm-installed node-pty never releases."
  (both per lexical search of `config/relay-assets/`; file names and one-line purpose confirmed, full patch bodies not read — **file existence/purpose verified, patch contents not fully reviewed**.)
- Dozens of dedicated test files exist directly against `node-pty` (`*.node-pty.test.ts`, `*.win32.test.ts`) covering fd leaks, master-fd retirement, wide-char duplication under ConPTY, and shell-ready detection — e.g.:
  [stablyai/orca:src/main/daemon/node-pty-fd-leak.test.ts](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/daemon/node-pty-fd-leak.test.ts) (per lexical search preview; not opened in full)

### Windows (ConPTY) vs. Unix (real PTY) handling

- `LocalPtyProvider implements IPtyProvider`, backed by `node-pty`'s `IPty`, is the single cross-platform entry point for spawn/write/resize/shutdown; platform branching happens *inside* its helper modules rather than in the public interface:
  [stablyai/orca:src/main/providers/local-pty-provider.ts:1-96](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/providers/local-pty-provider.ts)
- Windows gets a **dedicated ConPTY warm-up** at daemon boot (first ConPTY spawn pays ~2.7s one-time cost for native module load + Defender scan of bundled `conpty.dll`/`OpenConsole.exe`; warmed to ~70ms), explicitly passing `useConptyDll: true` to match real terminal spawns:
  [stablyai/orca:src/main/daemon/windows-conpty-warmup.ts:1-51](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/main/daemon/windows-conpty-warmup.ts)
- Orca models three distinct PTY "owner backends" explicitly: `'posix-pty' | 'windows-conpty' | 'windows-wsl'` — i.e. Windows running WSL as a guest shell is treated as its own backend, separate from native ConPTY:
  `stablyai/orca:src/shared/pty-owner-backend.ts:1-23` (per lexical search; one-line excerpt only, not re-fetched in full)
- Extensive Windows-specific quirk-handling modules exist for ConPTY's line-discipline differences vs. POSIX ptys: bracketed-paste/mouse-encoding differences (`terminal-mouse-encoding.ts`, `agent-prompt-injection.ts` — "Windows ConPTY ingests pasted input linearly"), PSReadLine prompt-repaint bugs after buffer clears (`session-powershell-prompt-repaint.ts`), and foreground-process scanning differences (`stable-foreground-process.ts` — ConPTY's `Get-CimInstance Win32_Process` scan behaves differently). (All per lexical-search snippets; file purposes verified by their own inline comments, full bodies not all read.)
- A Rust native helper, `native/windows-cli-launcher` (Cargo project, has `build.rs`, `app.manifest`), exists specifically for launching CLIs on Windows — likely to work around `.cmd`/shell-quoting and console-attach issues referenced elsewhere (`claude-agent-sdk-process-spawn.ts`'s comment about `.cmd` argument encoding). **Its exact role was not directly read (only the directory listing was fetched) — inferred from naming, not verified line-by-line.**
  [stablyai/orca:native/windows-cli-launcher (directory listing)](https://github.com/stablyai/orca/tree/7c50009ca4946cf7384495f542d0b5856308b70c/native/windows-cli-launcher)

### Terminal UI rendering component

**xterm.js**, via the `@xterm/*` package family, rendered with the **WebGL addon** for performance:
- `package.json`: `"@xterm/xterm": "6.1.0-beta.303"`, `"@xterm/addon-webgl": "0.20.0-beta.299"`, plus `addon-fit`, `addon-image`, `addon-ligatures`, `addon-search`, `addon-serialize`, `addon-unicode11`, `addon-web-links`, and `@xterm/headless` (used server/daemon-side for scrollback serialization without a DOM).
- Renderer code explicitly constructs the WebGL renderer and lazy-loads it (noting the addon is 243 KB and only built once a terminal is actually shown):
  [stablyai/orca:src/renderer/src/lib/pane-manager/pane-webgl-renderer.ts](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/renderer/src/lib/pane-manager/pane-webgl-renderer.ts) (per lexical search; file located, not fully read)
  [stablyai/orca:src/renderer/src/main.tsx:84](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/renderer/src/main.tsx)
- The data path from PTY to xterm: `write-pty-output-to-xterm.ts` ("the xterm write path for PTY output, including the queued agent-idle mode reset"):
  [stablyai/orca:src/renderer/src/components/terminal-pane/pty-connection/write-pty-output-to-xterm.ts](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/src/renderer/src/components/terminal-pane/pty-connection/write-pty-output-to-xterm.ts) (per lexical search preview)
- The README itself (secondary but repo-hosted, counts as primary per the research scope since it's the repo's own doc) advertises "Ghostty-class terminals with WebGL rendering, infinite splits, and scrollback that survives restarts" — consistent with the code evidence above:
  [stablyai/orca:README.md](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/README.md)

The mobile app also bundles `@xterm/xterm` + `@xterm/addon-webgl` + `@xterm/addon-unicode11` (per `mobile/package.json`), rendering terminal output inside a WebView on the phone rather than natively.

---

## Q5: Tech stack and license

### Tech stack (desktop app, `src/` + `native/`)

- **Language:** TypeScript almost everywhere (GitHub reports repo primary language as TypeScript); native addons in Rust (`native/windows-cli-launcher`, Cargo-based) and presumably C/Objective-C/Swift for the macOS `computer-use-macos`/`keyboard-layout-macos`/`notification-status-macos` addons (not opened in detail — **inferred from directory names**, not line-verified).
- **App shell:** **Electron 43.7.5** (`package.json`), built via **`electron-vite`** (`electron.vite.config.ts` at repo root) and **Vite** (pinned to `rolldown-vite@7.3.1` via the `vite` npm alias).
- **UI:** **React ~19.2.8**, with `components.json` indicating shadcn/ui-style component generation conventions.
- **Terminal:** `@xterm/xterm` 6.1.0-beta + WebGL/search/serialize/ligatures/image/unicode11/web-links addons; `node-pty` ^1.1.0 for the PTY backend.
- **Claude integration:** `@anthropic-ai/claude-agent-sdk` 0.3.284 (used only for its headless stream-json protocol over a user-supplied CLI binary — see Q1).
- **Speech/voice:** `sherpa-onnx` 1.12.37 (+ per-platform native packages `sherpa-onnx-{darwin,linux,win}-*`), suggesting on-device speech features.
- **Monorepo/build tooling:** **pnpm workspaces** (root `pnpm-workspace.yaml`), **TypeScript ^7.0.2** (the new Go-based `tsgo`/TS7 compiler line), **oxlint**/**oxfmt** (Rust-based linter/formatter, `.oxlintrc.json`/`.oxfmtrc.json`), Husky git hooks (`.husky/`).
  [stablyai/orca:package.json](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/package.json) (fetched and grepped; full 28 KB file not quoted in full, key lines excerpted above)
- **CLI:** Orca ships its own `orca` CLI (`bin.orca` → `./out/cli/index.js`) built from `src/cli/`, used both by users (`orca worktree create`, `orca snapshot`, etc. per README) and for Windows-specific launch indirection.
- **Cloud relay (`cloud/`):** separate pnpm workspace, Node services (`apps/relay`, `apps/push`), PostgreSQL in production / SQLite for tests, Terraform (`infra/terraform`) for GCP infra, GitHub Actions workflows gated behind a repo variable so they're inert for forks:
  [stablyai/orca:cloud/README.md](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/cloud/README.md)
- **Mobile (`mobile/`):** **Expo ~55** / **React Native ^0.83.10** / **React 19.2.8**, Zustand for state, `ws` for WebSocket relay client, `@xterm/xterm` + WebGL addon inside a WebView for terminal rendering, `zod` for schema validation.
  [stablyai/orca:mobile/package.json](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/mobile/package.json)
- **Packaging/distribution:** Homebrew Cask (`Casks/`), AUR (`stably-orca-bin`/`stably-orca-git`), signed Windows builds via SignPath.io (per README), GitHub Releases for macOS/Windows/Linux builds and separate Android APK releases.

### License

**MIT License**, copyright **"Lovecast Inc."** (the legal entity behind Stably/Orca), year 2026:

[stablyai/orca:LICENSE](https://github.com/stablyai/orca/blob/7c50009ca4946cf7384495f542d0b5856308b70c/LICENSE) **[whole file, 21 lines]**

> "MIT License — Copyright (c) 2026 Lovecast Inc. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND..."

The root `README.md` reiterates: *"Orca is free and open source under the [MIT License](LICENSE)."* and the `cloud/README.md` states the relay/push code "is covered by the repository's root MIT license." GitHub's own repo metadata (`search_repositories` API) independently reports `license.spdx_id: "MIT"`.

The `cloud/README.md` also discloses a boundary: *"The `terraform-foundation` and `terraform-apps` roots and the API and auth services live in the **private** `stablyai/orca-cloud` repository"* — i.e. not everything behind the product is open-sourced; some cloud backend/auth code is explicitly private and outside the MIT grant (because it simply isn't in this repo).

### What could legally be reused by a separate, fresh-built, non-forked project

Under MIT, a new project (even a commercial, closed-source one, and even one that is a direct competitor) may **use, copy, modify, merge, publish, distribute, sublicense, and/or sell** copies of anything in this repository, including:
- Code concepts/architecture (the `TuiAgent`/`TUI_AGENT_CONFIG` pluggable-adapter pattern, the headless-one-shot-matcher table, the Claude Agent SDK spawn-override trick, the worktree naming/slugification/conflict-suffixing logic, the node-pty ConPTY warm-up trick, the xterm WebGL wiring) — these are plain facts/ideas and also literally copyable as MIT-licensed source.
- Actual source files, verbatim or modified, **as long as** the MIT license text and the Lovecast Inc. copyright notice are preserved/included "in all copies or substantial portions of the Software" (the one substantive MIT condition).
- There is **no copyleft** obligation (unlike GPL/AGPL): a downstream project need not open-source its own additions, and need not share modifications back.
- **Caveat 1 — scope:** this MIT grant covers only what's physically in `stablyai/orca`. The private `stablyai/orca-cloud` repo (API/auth services, some Terraform) is outside this grant entirely; nothing can be assumed about its license from this repo.
- **Caveat 2 — third-party deps:** MIT covers Orca's own code, not its dependencies (`@anthropic-ai/claude-agent-sdk`, `node-pty`, `@xterm/*`, Electron, etc.), each under its own separate license; a reuser must independently satisfy those.
- **Caveat 3 — trademarks/branding:** MIT doesn't grant rights to the "Orca" name/logo/brand; those are typically governed separately (not addressed in the LICENSE file itself; no explicit trademark clause was found in this repo).
- **Caveat 4 — this is general information, not legal advice**; a real reuse decision should get a lawyer to confirm no other repo-specific terms (e.g. CONTRIBUTING.md CLA requirements for *contributing back*, which is a different question from *consuming* the MIT code) apply.

---

## Gaps and uncertainties

- **Exact Claude `stream-json` control-message schema** (`claude-stream-json-frame-schema.ts`) was located via search but not read in full — only inferred from surrounding code/comments.
- **The precise function/file that performs worktree-name/branch collision suffixing** (`-2`, `-3`, ...) was confirmed only via its *test* (`worktrees-ssh-branch-conflict-suffixing.test.ts`); the production implementation module was not directly located/opened in this pass.
- **Native addon languages for macOS-only helpers** (`computer-use-macos`, `keyboard-layout-macos`, `notification-status-macos`) were inferred from directory names/typical Electron-native conventions, not verified by opening their source (likely Swift/Objective-C/C, not confirmed).
- **`native/windows-cli-launcher`'s exact runtime role** was inferred from its name, its Cargo/Rust nature, and an adjacent code comment about `.cmd` argument encoding on Windows in `claude-agent-sdk-process-spawn.ts`; its `src/` files were not opened.
- **`pi`'s and other non-hook-service agents' status-tracking mechanism** (PTY-output parsing heuristics like `composerReadyCaptures`) is described structurally from file/field names; the actual parsing/regex logic was not opened in depth.
- **Whether a CLA or other contribution terms apply to contributing back to the repo** (as opposed to consuming the MIT-licensed code) — a `CONTRIBUTING.md` is referenced by the README (`.github/CONTRIBUTING.md`) but was not fetched/read in this research pass.
- **Trademark policy for "Orca" branding** — not found in-repo; likely governed outside the LICENSE file (unconfirmed either way).
- GitHub repo metadata (stars/forks/open issues counts, "yc-backed" topic) reflects **API metadata at research time**, not a source-code claim, and was not independently verified beyond the single `search_repositories` call.

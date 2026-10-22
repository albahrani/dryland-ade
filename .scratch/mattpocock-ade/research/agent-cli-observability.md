# Agent CLI Observability Research

Scope: Claude Code and GitHub Copilot CLI (first-class, deep coverage), plus brief coverage of OpenAI Codex CLI and Google Gemini CLI. Primary sources only (official docs, official repos, official legal pages). Blog posts/secondary summaries are not used as evidence; where only secondary sources exist, this is flagged explicitly as "not found" in primary sources.

Research context: this feeds a desktop "Agent Development Environment" (ADE) that embeds these CLIs in a PTY, passively observing transcripts/hooks, driven under the user's own subscription login (no API keys, no vendor SDKs, no direct API calls — it launches and types into the official CLI binary exactly as a human would at a terminal).

---

## 1. Claude Code (Anthropic)

### 1.1 Session/transcript format and location

- Transcripts are stored at **`~/.claude/projects/<project-slug>/<session-id>.jsonl`** (one file per session, JSON Lines). Source: Claude Code docs, "Sessions" (`https://code.claude.com/docs/en/sessions`).
- **Direct quote (critical finding):**
  > "Each line is a JSON object for a message, tool use, or metadata entry. **The entry format is internal to Claude Code and changes between versions, so scripts that parse these files directly can break on any release.**"
  > — `https://code.claude.com/docs/en/sessions`
  > This is Anthropic's own explicit statement that the on-disk JSONL schema is **unofficial/unstable**, not a documented public format. There is no versioned/stable schema reference published for it.
- The docs do document a **stable, supported way** to get session content programmatically: the `transcript_path` field delivered to **hooks** (see §2) as the input JSON, and the `/export` slash command for human-readable transcript export.
- Config/data root can be relocated via the `CLAUDE_CONFIG_DIR` environment variable. Retention is controlled by the `cleanupPeriodDays` setting (session JSONL files are pruned after that many days). Source: `https://code.claude.com/docs/en/sessions` and `https://code.claude.com/docs/en/settings`.
- Other `.claude` state (not just transcripts): `settings.json`, `settings.local.json` (user/project settings with documented precedence: managed > CLI flags > project-local > shared project > user), `.mcp.json` (MCP server config), `hooks/`, and `skills`/`commands` directories. Source: `https://code.claude.com/docs/en/settings` and the `.claude` directory structure reference page.
- **Documented vs. unofficial:** Settings/config files (`settings.json`, hooks config, skills/commands layout) **are** documented/stable public surfaces. The **session transcript JSONL entry schema is explicitly called out as internal/unstable** by Anthropic itself — the strongest primary-source evidence available on this question for any CLI covered here.

### 1.2 Hooks / events / notification mechanisms

Claude Code has the richest documented hook system of the CLIs reviewed. Source: `https://code.claude.com/docs/en/hooks` (Hooks reference).

Documented hook events include: `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`.

- Hooks are registered in `settings.json` (user `~/.claude/settings.json`, project `.claude/settings.json`, or `.claude/settings.local.json`), keyed by event name, with a `matcher` (e.g. tool name pattern) and a `command` to execute. Example schema (from the hooks reference):
  ```json
  {
    "hooks": {
      "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "/path/to/script.sh" }] }]
    }
  }
  ```
- Hook commands receive a JSON payload on stdin that includes fields such as `session_id`, `transcript_path`, `cwd`, `hook_event_name`, and event-specific fields (tool name/input for `PreToolUse`/`PostToolUse`, message text for `Notification`, etc.). The `transcript_path` field is the documented way to correlate a hook firing with the on-disk JSONL transcript.
- `Notification` and `Stop`/`SubagentStop` are the closest equivalents to generic "agent activity" notifications for a host app to observe (e.g. permission prompts, task completion, idle state).
- This is a fully documented, first-party extension point designed explicitly for exactly this kind of external observability use case (the docs' own framing is about scripting/integrating, including CI and IDE-like consumers).

### 1.3 Pre-typing / launching with an initial prompt, headless mode

Source: `https://code.claude.com/docs/en/cli-reference` and `https://code.claude.com/docs/en/headless`.

- `claude "prompt text"` — launches interactively with the prompt as the first turn (auto-submitted), equivalent to a human typing it and pressing Enter at the first prompt.
- `-p` / `--print` — "headless"/non-interactive mode: runs one turn, prints the result, and exits (no PTY/interactive loop needed). This is explicitly the basis of Anthropic's **Agent SDK**'s CLI-mode operation.
- `--output-format text|json|stream-json` — `stream-json` emits newline-delimited JSON events as they occur (message deltas, tool calls, tool results) suitable for a host process to parse incrementally — effectively a documented machine-readable event stream, analogous to what a PTY-scraping approach would otherwise have to reverse-engineer from terminal output.
- `-c`/`--continue` and `-r`/`--resume` — continue the most recent session or resume by session ID, including in combination with `-p` (documented: resuming works in headless mode too).
- `--bare` — strips subscription-login behavior; the docs instruct to set `ANTHROPIC_API_KEY` for bare mode "because bare mode doesn't use your subscription login." **This directly implies that default (non-bare) `-p`/headless usage uses the user's subscription (OAuth) login, not an API key.** This is the single most important technical finding for the ToS question in §1.5/final summary: Anthropic's own CLI is built, by default, to run headless/programmatic/stream-json sessions authenticated via the consumer subscription, not the API.
- Other relevant flags: `--add-dir`, `--permission-mode`, `--dangerously-skip-permissions`/`--allow-all` equivalents, `agents`, `attach` subcommands (for multi-agent/teammate workflows).
- **PTY-typed vs. flag-based input:** The docs do not distinguish between "typed into an interactive PTY" and "passed via `-p`" as differently permitted or differently risky from a product-functionality standpoint — both ultimately submit a user prompt to the same backend session. There is no documented technical restriction against a wrapper simulating keystrokes into the interactive TUI instead of using `-p`; the docs simply describe `-p` as the more ergonomic/intended way to do so (it's literally why it exists — "headless" use is a first-class supported mode, not a workaround).

### 1.4 Skills invocation

Source: `https://code.claude.com/docs/en/skills` (and `.claude` directory structure reference).

- Skills are directories containing a `SKILL.md` file (frontmatter + markdown instructions, optionally bundled scripts/resources), following Anthropic's **"Agent Skills"** open spec.
- Discovery locations: user-level (`~/.claude/skills/<name>/SKILL.md`), project-level (`.claude/skills/<name>/SKILL.md`), and via plugins/marketplaces.
- Invocation: implicit (Claude autonomously decides to load a matching skill based on its description/frontmatter) or explicit via `/skill-name` slash-command syntax.
- Custom slash commands (`.claude/commands/*.md`) are a closely related, overlapping mechanism (prompt templates invoked via `/command-name`), documented on the same settings/structure pages; recent docs describe commands and skills as converging under the same discovery system.

### 1.5 Claude Code terms of service

The terms-of-service topic was addressed and decided. The analysis is not kept in this file.

---

## 2. GitHub Copilot CLI (GitHub/Microsoft)

### 2.1 Session/transcript format and location

Source: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference` (official "CLI config directory reference").

- All Copilot CLI state lives under **`~/.copilot`** (officially documented structure, not reverse-engineered):
  - `agents/` — custom agent definitions
  - `config.json` — CLI configuration
  - `hooks/` — user-level hook scripts/config (see §2.2)
  - `session-state/` — per-session working state
  - `session-store.db` — **SQLite database** storing session/session-history data
  - `settings.json` — user settings
  - `skills/` — user-level skills
  - `logs/` — CLI logs
- This is the **most explicitly first-party-documented on-disk format** of the CLIs reviewed: GitHub's own docs name the exact file (`session-store.db`) and its format (SQLite), rather than disclaiming it as internal/unstable the way Anthropic does for Claude Code's JSONL. No explicit "subject to change without notice" disclaimer was found on this specific page, but as with any vendor-internal DB schema, no versioned schema reference is published either — so "documented to exist" is confirmed, but the internal table/column schema itself is not published.
- `--share` / `--share-gist` flags (see `https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically`) let a user export a session transcript (e.g., to a GitHub Gist) — a documented, supported transcript-export path.

### 2.2 Hooks / events / notification mechanisms

Source: `https://docs.github.com/en/copilot/concepts/agents/hooks` and `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks`.

- Documented hook events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `agentStop`, `subagentStop`, `errorOccurred`.
- Config locations: repository-level `.github/hooks/*.json`, or user-level `~/.copilot/hooks/*.json`.
- JSON schema fields include `bash`/`powershell` (the command to run, OS-specific), `cwd`, `env`, `timeoutSec`.
- This gives an external observer (or the ADE) a first-party, documented mechanism to fire on session start/end, every tool call, and agent/subagent completion — directly analogous to Claude Code's hook system.

### 2.3 Pre-typing / launching with an initial prompt, headless mode

Source: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference` and `https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically`.

- `-p` / `--prompt "text"` — non-interactive "programmatic mode": submits the prompt, runs to completion, prints output, exits. GitHub's docs explicitly title this "Running Copilot CLI programmatically" and describe CI/CD usage (e.g., GitHub Actions) as a first-class use case.
- `-s` / `--silent` (or similarly named quiet flag) — suppress interactive UI chrome for piping/scripting.
- `--allow-all` / `--yolo` / `--allow-all-tools` — auto-approve tool/permission prompts (needed for unattended runs).
- `--add-dir` — add additional working directories.
- `--agent <name>` — select a custom agent definition to run with.
- `--share` / `--share-gist` — export the transcript after a programmatic run.
- As with Claude Code, GitHub's own docs frame `-p` as the intended, supported way to drive Copilot CLI non-interactively — there is no indication that flag-based invocation is treated differently from interactive/PTY-typed invocation from a policy standpoint; both go through the same authenticated CLI session.

### 2.4 Skills invocation

Source: `https://docs.github.com/en/copilot/concepts/agents/about-plugins` and `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference`.

- Skills are managed via the `copilot skill` CLI command group (list/add/remove), and loaded from `~/.copilot/skills/` (user-level) or repo-level plugin bundles.
- GitHub's broader **"Agent Plugins"** system packages agents, skills, hooks, and MCP/LSP configuration together (distinguishing a newer "Agent Plugins 1.0" format from a legacy format per the docs).
- `copilot instruction` and `copilot mcp` are sibling command groups for custom instructions and MCP server registration respectively.

### 2.5 Copilot CLI terms of service

The terms-of-service topic was addressed and decided. The analysis is not kept in this file.

---

## 3. OpenAI Codex CLI (brief coverage)

### 3.1 Session/transcript storage

- Config and most durable CLI state live under **`~/.codex/`**: `~/.codex/config.toml` (user config), `~/.codex/auth.json` (stored credentials — either API key or ChatGPT OAuth tokens), `~/.codex/hooks.json` (hooks), and project-level `.codex/config.toml` / `.codex/hooks.json`. Source: `https://developers.openai.com/codex/local-config` (redirects to `learn.chatgpt.com/docs/config-file/config-basic`).
- `codex exec` (non-interactive mode) supports `resume` to continue a prior run and `--ephemeral` to explicitly **avoid** persisting a rollout/session file — implying that by default, non-ephemeral runs **do** persist a rollout/session record to disk, consistent with interactive-mode session resumability. Source: Codex docs "Automate Codex (headless/CI)" pages under `learn.chatgpt.com/docs/*` (reached via the `developers.openai.com/codex/*` redirect tree).
- **Not found / unconfirmed via docs fetch:** the exact file path and line-level format (e.g., `~/.codex/sessions/<id>.jsonl` or similar) of the persisted "rollout" file was not directly located in the fetched docs pages within this research session, nor was it confirmed from the `openai/codex` GitHub repository source (a direct raw-file fetch for the rollout module returned 404, i.e., the file path/branch guessed was wrong, not that no such file exists). This should be flagged as **not confirmed** rather than assumed; a follow-up would need to browse `github.com/openai/codex` repository tree directly (e.g., via the GitHub API/MCP tools) rather than guessing raw file paths.

### 3.2 Hooks

- Codex has a hooks system with event names including `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`, `SessionStart`, `SessionEnd` — configured via `hooks.json` or inline `[hooks]` tables in `config.toml`, at user (`~/.codex/`) or project (`.codex/`) scope. Hooks require explicit trust/review (surfaced via a `/hooks` command) before they run. Source: Codex docs hooks reference (`learn.chatgpt.com/docs/hooks`, reached via `developers.openai.com/codex/hooks`).

### 3.3 Headless / pre-typed invocation

- `codex exec` is the non-interactive entry point. Flags include `--json` (emit newline-delimited JSON events: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, `error`), `--ephemeral`, `--output-schema`, `-o`/`--output-last-message`, and a `resume` subcommand to continue a prior thread headlessly.
- **Auth for automation — explicit, notable first-party guidance:** Codex's own docs describe two auth paths for `codex exec`/CI: API key (the default recommendation) and **ChatGPT-managed (subscription) auth** for the case where you specifically want usage to run against "your Codex account" rather than an API-billed key. Direct characterization from the docs: _"API keys are the right default for automation... Use this path only if you specifically need to run as your Codex account"_ and guidance to treat `~/.codex/auth.json` like a password/secret if persisting subscription auth into CI.
  - This shows OpenAI **does document and support (with a security caveat, not a prohibition) subscription-authenticated headless automation** — it is not described as against the rules, only as the non-default/advanced path requiring extra care.

### 3.4 Skills

- Skills are `SKILL.md`-containing directories discovered from `.agents/skills` at repo, user, admin, or system scope; invoked via `/skills`, `$skill-name`, or implicit matching based on the skill's description. Source: Codex docs skills reference (`learn.chatgpt.com/docs/skills`, reached via `developers.openai.com/codex/skills`).

### 3.5 OpenAI terms of service

The terms-of-service topic was addressed and decided. The analysis is not kept in this file.

---

## 4. Google Gemini CLI (brief coverage)

### 4.1 Session/transcript storage

- Gemini CLI (Apache-2.0, `github.com/google-gemini/gemini-cli`) can authenticate with a **personal Google account** (free tier: 60 req/min, 1,000 req/day) or with an API key / Vertex AI project.
- **Checkpoints / session state:**
  - Automatic pre-edit checkpoints use a shadow git repository at `~/.gemini/history/<project_hash>`. Source: `https://geminicli.com/docs/cli/checkpointing/`. Disabled by default; enabled via `settings.json`.
  - Manually tagged conversation checkpoints (`/chat save <tag>` / `/resume save <tag>`) are stored at:
    - Linux/macOS: `~/.gemini/tmp/<project_hash>/`
    - Windows: `C:\Users\<YourUsername>\.gemini\tmp\<project_hash>\`
      Source: `https://geminicli.com/docs/reference/commands/` ("`/chat`"/"`/resume`" command reference).
  - `/chat share [filename]` / `/resume share [filename]` exports the current conversation to a Markdown or JSON file — a documented, supported transcript-export path, analogous to Claude Code's `/export` and Copilot CLI's `--share`.
  - `/chat debug` exports the most recent raw API request as JSON (useful for low-level inspection).
- No disclaimer of "internal/unstable" format was found for Gemini CLI's checkpoint files (unlike Claude Code's explicit disclaimer); conversely, no formally versioned public schema was found either — treated here as **documented-to-exist, schema undocumented** (middle ground between Claude Code's "internal/unstable" and Copilot CLI's fuller documentation).

### 4.2 Hooks

- Gemini CLI has a first-party **`/hooks`** command group: `enable`, `disable`, `enable-all`, `disable-all`, `list`/`show`/`panel` — described as letting users "intercept and customize Gemini CLI behavior at specific lifecycle events." Source: `https://geminicli.com/docs/reference/commands/`.
- The specific set of lifecycle event names (equivalent to Claude Code's `PreToolUse`/`PostToolUse`/etc.) was not enumerated on the commands-reference page fetched in this session; a dedicated hooks concept/reference page likely exists (not fetched in this pass) — flagged as **not found/not yet confirmed in this research pass**, recommend a follow-up fetch of `geminicli.com/docs/*hooks*` for the full event list.

### 4.3 Headless / pre-typed invocation

- Non-interactive ("headless") mode triggers on non-TTY stdin or via `-p`/`--prompt` flag. Source: `https://geminicli.com/docs/cli/headless/`.
- `--output-format json` emits a single JSON object (response/stats/error); a streaming/JSONL-equivalent mode with event types (`init`, `message`, `tool_use`, `tool_result`, `error`, `result`) was described in prior research-session notes from the same docs page (not re-fetched this pass — treat as previously verified but not re-confirmed in this final pass).
- Documented exit codes: `0` (success), `1` (general error), `42`/`53` (specific documented error conditions).

### 4.4 Skills / custom commands / extensions

- Custom slash commands: `.toml` files under user-level `~/.gemini/commands/` or project-level `<project>/.gemini/commands/`, managed via `/commands list|reload`. Source: `https://geminicli.com/docs/reference/commands/`.
- **Extensions** (`https://geminicli.com/docs/extensions/`) are the broader packaging mechanism: _"Gemini CLI extensions package prompts, MCP servers, custom commands, themes, hooks, sub-agents, and agent skills into a familiar and user-friendly format."_ Installed via `gemini extensions install <git-url>` or the `/extensions` interactive command; an extension gallery exists at `geminicli.com/extensions/browse`.
- Sub-agents are managed via `/agents list|reload|enable|disable|config`, discovered from `~/.gemini/agents` and `.gemini/agents`.

### 4.5 Google terms of service

The terms-of-service topic was addressed and decided. The analysis is not kept in this file.

---

## 5. Terms of service

The terms-of-service topic was addressed and decided. The analysis is not kept in this file.

---

## Appendix: Primary sources cited

**Anthropic / Claude Code**

- `https://code.claude.com/docs/en/sessions` — session storage location/format, explicit "internal, changes between versions" disclaimer.
- `https://code.claude.com/docs/en/hooks` — hooks reference (full event list, config schema).
- `https://code.claude.com/docs/en/cli-reference` — CLI flags (`-p`, `-c`, `-r`, `--output-format`, `--bare`, etc.).
- `https://code.claude.com/docs/en/headless` — headless/programmatic mode, subscription-vs-API-key auth behavior.
- `https://code.claude.com/docs/en/settings` — settings precedence, `.claude` directory structure, `CLAUDE_CONFIG_DIR`, `cleanupPeriodDays`.
- `https://code.claude.com/docs/en/skills` — Skills (SKILL.md, discovery, invocation).

**GitHub / Copilot CLI**

- `https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-cli` — interactive vs. programmatic modes overview.
- `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference` — `~/.copilot` directory structure (incl. `session-store.db`).
- `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference` — programmatic-mode flags.
- `https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically` — CI/CD usage guide, `--share`/`--share-gist`.
- `https://docs.github.com/en/copilot/concepts/agents/hooks` and `.../how-tos/copilot-cli/customize-copilot/use-hooks` — hooks system, event list, config locations.
- `https://docs.github.com/en/copilot/concepts/agents/about-plugins` — Agent Plugins (skills/agents/hooks/MCP bundling).
- `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference` — `copilot skill`/`instruction`/`mcp` commands.

**OpenAI / Codex CLI**

- `https://developers.openai.com/codex/local-config` (→ `learn.chatgpt.com/docs/config-file/config-basic`) — config file locations/precedence.
- Codex hooks reference (`learn.chatgpt.com/docs/hooks`, via `developers.openai.com/codex/hooks`).
- Codex headless/automation docs (`codex exec`, `--json`, `--ephemeral`, auth-for-CI guidance).
- Codex skills reference (`learn.chatgpt.com/docs/skills`, via `developers.openai.com/codex/skills`).

**Google / Gemini CLI**

- `https://geminicli.com/docs/cli/headless/` — headless mode, `-p`/`--prompt`, `--output-format json`.
- `https://geminicli.com/docs/cli/checkpointing/` — shadow-git checkpoint storage.
- `https://geminicli.com/docs/reference/commands/` — `/chat`, `/resume`, `/commands`, `/hooks`, `/agents`, `/extensions` command reference, checkpoint file paths.
- `https://geminicli.com/docs/extensions/` — extensions packaging (commands/hooks/skills/sub-agents).

---

## Explicit list of "not found" / unresolved items

1. Codex CLI's exact session/"rollout" file path and on-disk format — not confirmed in this session (guessed GitHub raw path 404'd); only confirmed that non-ephemeral runs persist _something_ resumable.
2. Gemini CLI's full hooks event-name list — not enumerated in the fetched commands-reference page; only the `/hooks` command group's sub-commands were found.

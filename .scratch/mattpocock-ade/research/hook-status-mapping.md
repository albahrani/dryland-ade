# Hook-event → ADE session-state mapping (Claude Code & GitHub Copilot CLI)

Scope: which hook events map to ADE states **running / waiting-for-input / idle / ended**.
Primary sources only. Builds on `agent-cli-observability.md` (hook inventories) but adds the
state-mapping and empirical worktree-resolution test that file didn't cover.

---

## 1. Claude Code

Source: `https://code.claude.com/docs/en/hooks` (fetched 2026-10-09).

| ADE state | Hook event(s) | Notes |
| --- | --- | --- |
| **running** | `UserPromptSubmit` → ... → `PreToolUse`/`PostToolUse`/`PostToolBatch`/`SubagentStart`/`TaskCreated` (anything between prompt submit and `Stop`) | "Per turn" and "per tool call" cadences per the docs' own lifecycle grouping. |
| **waiting-for-input** | `Notification` with `matcher`/`notification_type` = **`permission_prompt`** or **`agent_needs_input`**; also `PermissionRequest` (fires whenever a tool call needs a permission decision) | Confirmed directly from the docs' **matcher table**: `Notification` → "notification type" column lists `permission_prompt, idle_prompt, auth_success, elicitation_dialog, elicitation_url_dialog, elicitation_complete, elicitation_response, agent_needs_input, agent_completed, quota_auto_resume_fired, quota_auto_resume_stale, quota_auto_resume_disabled`. |
| **idle** | `Notification` with `notification_type` = **`idle_prompt`**; also `Stop` (turn finished, no pending tool/permission work) and `TeammateIdle` (team/subagent context) | `Stop`: "When Claude finishes responding." `TeammateIdle`: "When an agent team teammate is about to go idle." |
| **ended** | `SessionEnd` | Matcher values for *why*: `clear, resume, logout, prompt_input_exit, other`. |

Fallback/ambiguity notes:
- `Notification` is the single most useful event for an external observer: its `notification_type` matcher value directly encodes "needs permission" vs "idle" vs "agent completed", so a host app doesn't have to infer state from timing/absence of other events the way it does for Copilot CLI (below).
- `StopFailure` (turn ended due to API error) should probably map to a transient **error** sub-state rather than plain "ended"; it is not "ended" (`SessionEnd` is the only session-termination event) and not "running".

---

## 2. GitHub Copilot CLI

Sources: `https://docs.github.com/en/copilot/reference/hooks-reference` (the authoritative, current
reference — richer than the older `.../concepts/agents/hooks` overview page, which only lists
`sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse, agentStop, subagentStop,
errorOccurred` and predates the `notification`/`permissionRequest`/`userPromptTransformed` additions
documented in the newer reference page). Both fetched 2026-10-09.

| ADE state | Hook event(s) | Notes |
| --- | --- | --- |
| **running** | `sessionStart` (`source: "new"/"resume"`) → `userPromptSubmitted` → `preToolUse`/`postToolUse`/`postToolUseFailure`/`subagentStart`/`subagentStop` loop | Standard per-turn/per-tool cadence, directly analogous to Claude Code. |
| **waiting-for-input** | `notification` with `notification_type` = **`permission_prompt`** or **`elicitation_dialog`**; also `permissionRequest` (fires before the permission service runs, CLI-only, explicitly recommended for `-p`/CI use to auto-decide instead of blocking) | Confirmed from the **Notification types** table in the hooks reference: `shell_completed, shell_detached_completed, agent_completed, agent_idle, permission_prompt, elicitation_dialog`. This directly contradicts the common assumption (repeated in the older overview doc and in `agent-cli-observability.md`) that Copilot CLI has **no** hook event for "waiting for input" — it does, via `notification`, just not under that name in the simplified `agentStop`-only description. |
| **idle** | `notification` with `notification_type` = **`agent_idle`** ("a background agent finishes a turn and enters idle state, waiting for `write_agent`"); also plain `agentStop` ("the main agent finishes a turn") for the common single-agent case | `agent_idle` is specifically about *background/subagent* idle; for the primary/foreground agent, `agentStop` is the closest equivalent to Claude's `Stop`. |
| **ended** | `sessionEnd` | `reason`: `complete, error, abort, timeout, user_exit`. |

Corrected fallback note (supersedes the earlier "no event exists" assumption in
`agent-cli-observability.md` §2.2, which only reflected the older, non-exhaustive overview page):
Copilot CLI **does** have a documented, first-party "waiting for input" / "idle" signal via the
generic `notification` hook's `notification_type` matcher — the gap is only that the *overview*
doc (`.../concepts/agents/hooks`) under-documents it relative to the full reference page.
An ADE should register a `notification` hook with no matcher (or `matcher: ".*"`) and branch on
`notification_type` in the payload, the same pattern Claude Code's `Notification` event uses.

---

## 3. Empirical test: does a worktree-local `.github/hooks/*.json` resolve?

### Setup (exact commands)

```powershell
# temp repo + worktree, both under $env:TEMP
$base = Join-Path $env:TEMP ("ade-hook-test-" + [guid]::NewGuid().ToString("N").Substring(0,8))
$main = Join-Path $base "main-repo"; $wt = Join-Path $base "wt-repo"
New-Item -ItemType Directory -Path $main | Out-Null
Set-Location $main
git init -q; git config user.email t@t.com; git config user.name T
"hello" | Out-File readme.md; git add -A; git commit -q -m init
git branch wtbranch
git worktree add $wt wtbranch

# hook file only in the worktree
New-Item -ItemType Directory -Path "$wt\.github\hooks" -Force | Out-Null
Set-Content "$wt\.github\hooks\test-hooks.json" -Value '{
  "version": 1,
  "hooks": { "preToolUse": [ { "type":"command",
    "powershell": "Set-Content -Path ''<marker>'' -Value hooked" } ] }
}'
Set-Location $wt
git add .github/hooks/test-hooks.json; git commit -q -m "add hook"   # tried committed, too

copilot -p "run bash command: echo testing456" --allow-all-tools
Test-Path "$wt\marker-pretool.txt"   # -> result below
```

Also tried: a `sessionStart` hook (command type, `powershell` key) writing a different marker file,
both before and after `git add`/`git commit` of the hook file, and with `--log-level debug --log-dir`
pointed at a local folder to inspect the CLI's own debug log.

### Result: **hook did not fire**

- Neither the `sessionStart` nor the `preToolUse` worktree-only hook created its marker file, in any
  variant (uncommitted or committed hook file; `-p` with `--allow-all-tools`).
- A `bash`-tool call *did* happen in the same run (`echo testing456` ran successfully via the
  `powershell` tool, visible in the transcript), so the test did exercise the exact lifecycle point
  (`preToolUse`) the hook was registered for — the tool call executing with no hook firing is a
  genuine negative result, not a missed trigger.
- Debug log (`--log-level debug`) showed only two `hook.start`/`hook.end` telemetry pairs for the
  entire run, both clustered tightly around the tool call. Given no `sessionStart`-stage hook
  activity appears at all and the two pairs' timing doesn't correspond to a distinguishable
  "our hook ran" marker, this evidence is **inconclusive about which hook (if any) these
  correspond to** — flagged as unverified rather than asserted.

### Root cause (confirmed from primary source + on-disk evidence)

`https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference`
states `config.json` "is used to store internal state, such as installed plugins **and trusted
folders**." Inspecting (read-only) the real `~/.copilot/config.json` on this machine confirms a
`"trustedFolders": [...]` array exists, pre-populated with a handful of previously-opened repo
paths — the fresh temp repo/worktree created for this test was obviously not on that list, and no
interactive trust prompt is possible in `-p` (non-interactive, no TTY) mode. `copilot --help` also
documents `--add-dir` as the mechanism that "load[s] its `.github/skills` and `.github/agents` as
trusted configuration" for a given invocation — but the docs **do not list `.github/hooks` among
the directories `--add-dir` grants trust for**, and no `--trust`/equivalent CLI flag exists in the
current help output for repo-level hooks specifically.

**Most likely explanation for the negative result:** repository-level `.github/hooks/*.json` is
gated by the same first-run folder-trust mechanism as other repo-contributed config, and an
unattended/non-interactive first run in a brand-new directory (as a real ADE launching Copilot CLI
in a freshly created worktree would do) silently skips untrusted repo hooks rather than prompting
or erroring. This was **not independently re-confirmed by making a directory trusted and re-testing**
(doing so would require writing to the user's real `~/.copilot/config.json`, which the task
explicitly disallows) — **flagged as the strongest inferred-but-not-fully-isolated conclusion** in
this report. It is also not confirmed whether trusting the **main** checkout extends trust to a
`git worktree` sharing the same `.git` common dir, or whether trust is tracked per exact worktree
path — this distinction (main-only vs worktree-only hook placement) could not be tested because
the baseline (any) hook firing could not first be established in an untrusted temp directory.

### Practical implication for the ADE

Don't assume a hook file dropped into a freshly created worktree (e.g., one the ADE itself creates
per-task) will fire on the first, non-interactive run. Either: (a) pre-seed `trustedFolders` for
worktree paths the ADE creates (would require writing to the user's `~/.copilot/config.json` —
out of scope for passive observation, and a meaningful trust/security decision that shouldn't be
made silently on the user's behalf), or (b) treat hook-based observability as "best effort,
degrades to no signal in untrusted/new directories" and keep a PTY-output fallback (as the other
orchestrators surveyed in `multi-agent-hooks.md` already do) for the worktree case specifically.

---

## 4. Summary table (both CLIs)

| State | Claude Code | Copilot CLI |
| --- | --- | --- |
| running | `UserPromptSubmit` … `PreToolUse`/`PostToolUse` | `userPromptSubmitted` … `preToolUse`/`postToolUse` |
| waiting-for-input | `Notification(permission_prompt / agent_needs_input)`, `PermissionRequest` | `notification(permission_prompt / elicitation_dialog)`, `permissionRequest` |
| idle | `Notification(idle_prompt)`, `Stop`, `TeammateIdle` | `notification(agent_idle)`, `agentStop` |
| ended | `SessionEnd` | `sessionEnd` |

## Unverified / flagged items
- Whether `.github/hooks` repo-level config is gated by folder trust the same way `.github/skills`/`.github/agents` are implied to be by `--add-dir`'s description — inferred from config.json's documented purpose, not from an explicit hooks-and-trust statement in the hooks reference page itself.
- Whether trusting a main checkout propagates to its worktrees, or trust is tracked per worktree path — not testable without granting trust, which was out of scope (would touch the user's real config).
- The two `hook.start`/`hook.end` debug-log entries observed during the test — which internal hook(s) they correspond to was not identified.
- Claude Code findings are 100% docs-based; no empirical test was run (Claude Code is not installed on this machine per the task brief).

## Addendum: how Orca does it (read from source, commit 22534fe)

- **Hooks:** `src/main/copilot/hook-service.ts` writes one file, `~/.copilot/hooks/orca.json` (or `/hooks/`), plus a managed `copilot-hook.ps1`/`.sh` script. This is a user-level *hooks directory* Copilot loads, separate from `config.json`. The hook command is wrapped for PowerShell on Windows and `bash` elsewhere, with `timeoutSec: 5`.
- **Events used:** SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, subagentStart, SubagentStop, PreCompact, Stop, ErrorOccurred, PermissionRequest, Notification.
- **Routing:** the hook file is global, so the script reads per-pane env vars (`ORCA_PANE_KEY`, `ORCA_AGENT_LAUNCH_TOKEN`, `ORCA_AGENT_HOOK_PORT`/`TOKEN`, `ORCA_WORKTREE_ID`) that Orca sets only on its own PTYs, then POSTs to `http://127.0.0.1:<port>/hook/copilot`. Outside an Orca pane it exits 0 (guard against blocking stdin). A POSIX spool fallback is used when the server is unreachable.
- **Trust:** `src/main/agent-trust-presets.ts` `markCopilotFolderTrusted` appends the realpath of each new worktree to `trustedFolders` in `~/.copilot/config.json` (mode 0600, other keys preserved, skipped if the file is unparseable). Per its comments Copilot has no trust flag (checked against @github/copilot 1.0.32); this confirms our folder-trust diagnosis.
- **Implication:** user-level hooks dir + env-gated script avoids needing worktree-local hooks and trust for hooks, but still needs the trust entry to avoid the prompt. It does write to user config (hooks dir file and `config.json`).

## Verification (2026-10-13, Copilot CLI 1.0.95, Windows, ticket 17)

Setup: temp git repo + `git worktree add` (untrusted), `~/.copilot/hooks/ade-test.json` written, `config.json` backed up first.

Hook file shape that worked (`~/.copilot/hooks/<ade>.json`, `version: 1`, camelCase events, `powershell` key + `timeoutSec`, gated on an env var):

```json
{ "version": 1, "hooks": {
  "sessionStart": [ { "type": "command", "timeoutSec": 5,
    "powershell": "if ($env:ADE_PANE_KEY) { <report event to ade> }" } ],
  "agentStop":    [ ...same shape... ],
  "sessionEnd":   [ ...same shape... ] } }
```

Results:
1. **Global hook fires** under `copilot -p` in a worktree: `sessionStart`, `agentStop`, `sessionEnd` all logged. **Inert** when `ADE_PANE_KEY` is unset (no output, no error). Coexists with another user hook file (`rtk-rewrite.json`).
2. **Hooks fire even when the worktree is NOT in `trustedFolders`** under `-p`, so user-level hooks don't depend on trust (unlike the repo-level `.github/hooks` attempt above). `-p` never prompted for trust either way.
3. **Trust append**: adding the worktree realpath (JSON-escaped backslashes) as the last `trustedFolders` entry left the file valid JSON with every other key untouched; hooks still fired. Reverting (restoring the backup / removing the one entry) returned the file to its prior state (28 entries).

Not verified: interactive-mode trust prompt suppression and interactive hook firing (no headless way to drive the TUI here). Piping `-p` output through `Select -First N` closes the pipe early and truncates hook events; ADE should not do that. Also noted: `config.json.trusted-folders.lock` exists, so the ADE should respect/use that lock when editing, and tolerate Copilot rewriting the file.

## Interactive verification (2026-10-13, Copilot CLI 1.0.96, Windows, ticket 19)

Setup: temp repo + `git worktree add`, env-gated global hook `~/.copilot/hooks/ade-test.json` registering `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `agentStop`, `subagentStop`, `errorOccurred`, `notification`, `permissionRequest`, each piping stdin to a log. `config.json` and `hooks/` were backed up first. A human drove interactive `copilot` in a real terminal.

**Run A (worktree untrusted, `ADE_PANE_KEY=1`)**
- A trust prompt appeared with three options: "Yes", "Yes, and remember this folder for future sessions", "No (Esc)". "Yes" (this session only) left `config.json` unchanged.
- No hook fired for the launch, the trust prompt, or a typed but unsubmitted `/grilling`.
- After submitting "create a file x.txt containing hello", the log showed: `userPromptSubmitted` → `sessionStart` (`source: "new"`, `initialPrompt`) → `preToolUse` (`create`) → `permissionRequest` (`toolName: "edit"`) → `notification` (`notification_type: "permission_prompt"`, `title: "Permission needed"`) → after about 19 s waiting for approval, `postToolUse` → `agentStop` (includes `transcriptPath` under `~/.copilot/session-state/<sessionId>/`) → on `/exit`, `sessionEnd` (`reason: "user_exit"`).
- Every payload carries `sessionId`, `timestamp` and `cwd` (the worktree path).

**Run B (worktree appended to `trustedFolders`, `ADE_PANE_KEY=1`)**
- No trust prompt.
- `userPromptSubmitted` → `sessionStart` → `agentStop` → `sessionEnd`. During 60 s idle after `agentStop`, **no** `notification` (`agent_idle`) fired.

**Run C (no `ADE_PANE_KEY`)**: nothing logged. The hook is inert.

**Cleanup**: removing the single `trustedFolders` entry and the hook file left `config.json` byte-identical to the backup.

**Implications for the adapter**
- Hook-based status works in interactive mode; trust is only needed to avoid the prompt, not for hooks to fire.
- `sessionStart` is lazy: it fires at the first submitted prompt, not at launch. The ADE must derive "launched, waiting for user" from its own PTY spawn, and only learns the Copilot `sessionId` on first submit. Pre-typing a skill command emits nothing.
- Waiting = `permissionRequest` / `notification(permission_prompt)`; idle = `agentStop` (don't rely on `agent_idle`); running = `userPromptSubmitted` / `preToolUse` / `postToolUse`; ended = `sessionEnd`.
- `cwd` maps a session to its worktree (and so its ticket); `transcriptPath` is available if needed later.
- Pre-seeding `trustedFolders` is what keeps a freshly created worktree from showing the trust prompt; otherwise the user sees it once per worktree.

## Interactive launch verification (2026-10-15, Claude Code 2.1.300, Windows, ticket 33)

Setup: `claude.exe` with no arguments spawned through `node-pty` (ConPTY, 120x40) and rendered with `@xterm/headless`. Three working directories: this repo (already trusted), a `git worktree` of it in the sibling `mattpocock-ide.worktrees/` directory Dryland uses, and a fresh `git init` repo under `%TEMP%` (never trusted). Nothing was ever submitted and the trust dialog was never answered, so nothing was written to `~/.claude.json`.

**Pre-typed, unsubmitted command**
- One `write("/implement demo/01")` of the whole string is **dropped** on Windows: the prompt stays empty, even after 5 s. A bracketed paste (`ESC[200~ … ESC[201~`) is dropped too.
- One character per write, 15 to 20 ms apart, lands every time (5 of 5 runs): the prompt reads `❯ /implement demo/01`, the slash-command menu opens, and nothing is submitted without `\r`.
- Typing before the input box exists loses the text. The box is drawn about 1.5 s after spawn, after which the CLI is silent; 500 ms of output quiet after the first output was the reliable readiness signal (5 of 5 runs, typing began at 1.55 to 1.59 s).
- `CLAUDECODE=1` and the other `CLAUDE_CODE_*` variables inherited from a parent Claude Code session do not change any of this, so Dryland passes the environment through untouched. They do have one effect: when Dryland itself was started from inside a Claude Code session, the launched CLI shows "Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker". Dryland now removes those variables; see "Parent-session variables" below.

**Trust prompt**
- A worktree of a trusted repo is **not** prompted: Claude Code follows the main checkout's trust, so Dryland worktrees of a trusted project open straight to the input box.
- An untrusted repo shows a full-screen dialog: "Accessing workspace: … Quick safety check: Is this a project you created or one you trust? … ❯ No, exit / Yes, I trust this folder · Enter to confirm · Esc to cancel". The default is **No, exit**.
- Keystrokes typed while it shows are dropped, so a pre-typed command would be lost, and an Enter would exit. Spaces arrive as `ESC[1C` cursor moves, so the text, stripped of escapes, reads `Yes,Itrustthisfolder`; match it as `/trust\s*this\s*folder/i`. Moving the selection redraws both option lines, which still contain the phrase.

**Implications for the adapter**
- Launch `claude` with no arguments; pre-type one character at a time once the output has been quiet for 500 ms, and never while the quiet window holds a blocking prompt. After the user answers the dialog the CLI redraws to the input box, and the command is typed then.
- Dryland does not answer the trust dialog and writes no trust entry for Claude Code: the user answers it once per untrusted project.

**Other startup screens** (same day, each in a throwaway `CLAUDE_CONFIG_DIR`, so the user's config was never touched):
- **First run** (empty config): a theme picker, "Let's get started. Choose the text style that looks best with your terminal". It blocks typing. Match: `/choosethetextstyle/i`.
- **External imports**: when a CLAUDE.md in or above the project imports files outside it, a dialog asks "Allow external CLAUDE.md file imports?", defaulting to "No, disable external imports". It blocks typing. Match: `/allowexternalclaude\.mdfileimports/i`. Real repos with such imports show it once per project.
- **`ANTHROPIC_API_KEY` set**: "Detected a custom API key in your environment … Do you want to use this API key?", defaulting to "No (recommended)". It blocks typing. Match: `/usethisapikey/i`. Dryland neither reads nor sets the key, and does not answer the dialog for the user.
- **Not logged in**: there is **no** login screen. The CLI opens to its normal input box, with "Not logged in · Run /login" in the status line, so pre-typing works as usual. The guessed login pattern was dropped.
- Keys sent to these screens can appear one keypress late: an arrow key showed up only once the next key arrived. Another reason to never type into a dialog.

**Parent-session variables**: of the variables a running Claude Code session gives its children, `CLAUDE_CODE_CHILD_SESSION` alone turns transcript saving off in a launched CLI. Removing it, `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN` and `CLAUDE_PID` gives a normal top-level session. The adapter lists them as `parentSessionEnv`, and Dryland removes them from every session it starts. The user's own `CLAUDE_CODE_*` settings, such as `CLAUDE_CODE_USE_BEDROCK`, pass through.

**Through the built app** (Playwright driving the real CLI, same day): in a worktree of this trusted repo, "Start with Claude Code" on ticket 34 left `❯ /implement mattpocock-ade/34` in the input box, unsubmitted. In a worktree of an untrusted temp repo the trust dialog showed and, 3 s later, nothing had been typed.

## Status hook verification (2026-10-15, Claude Code 2.1.300, Windows, ticket 36)

Setup: `claude.exe --settings <file>` spawned through `node-pty` in a detached worktree of this trusted repo, with the parent-session variables removed and `DRYLAND_SESSION_ID` set. The settings file registered a command hook, with no matcher, for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `Stop`, `StopFailure`, `SubagentStop` and `SessionEnd`. Each hook logged its event and stdin. The driver typed "Use the Write tool to create a file named x.txt containing the word hello. Do nothing else.", pressed Enter, approved the permission dialog after 3 s, waited, then typed `/exit`. Nothing was written to user-level Claude config; the worktree was removed afterwards.

**Injection**
- Hooks from `--settings` fire alongside the user's own hooks; the user's settings are untouched.
- On Windows the hook commands run in Git Bash (`SHELL` is `C:\Program Files\Git\bin\bash.exe`), so a bare `dryland` resolves to the POSIX launcher. Hooks inherit the PTY environment, `DRYLAND_SESSION_ID` included.
- A `dryland status` hook with no app running takes about 80 ms through the Electron launcher.

**Observed order, default permission mode** (run 2, `--permission-mode default`)

| t (s) | Event | Payload detail |
| --- | --- | --- |
| 0.0 | `SessionStart` | `source: "startup"`, at launch, before any prompt |
| 4.5 | `UserPromptSubmit` | |
| 6.4 | `PreToolUse` | `tool_name: "Write"` |
| 6.5 | `PermissionRequest` | `tool_name: "Write"`, as the dialog shows |
| 9.8 | `PostToolUse` | after approval |
| 10.9 | `Stop` | |
| 13.2 | `SubagentStop` | after `Stop`, from a background helper; not a state change |
| 71.0 | `Notification` | `notification_type: "idle_prompt"`, 60 s after `Stop`, "Claude is waiting for your input" |
| 71.8 | `SessionEnd` | `reason: "prompt_input_exit"` on `/exit` |

- `Notification:permission_prompt` did not fire in the 3 s the dialog was open; `PermissionRequest` is the immediate waiting signal.
- In the user's auto permission mode (run 1, no `--permission-mode`) the Write was approved without a dialog: `UserPromptSubmit → PreToolUse → PostToolUse → Stop → SubagentStop`, no `PermissionRequest`, no `idle_prompt` within 75 s, then `SessionEnd`.

**Mapping**: the documented mapping holds and the adapter keeps it: running = `UserPromptSubmit`, `PreToolUse`, `PostToolUse`; waiting = `PermissionRequest`, `Notification:permission_prompt`, `Notification:elicitation_dialog` (the last two documented, not observed); idle = `Stop`, `Notification:idle_prompt`; ended = `SessionEnd`. `SessionStart` and `SubagentStop` are not mapped: launched comes from Dryland's spawn, and a subagent stopping says nothing about the session. Unlike Copilot, Claude Code's `SessionStart` fires at launch.

## Waiting-signal verification (2026-10-15, Claude Code 2.1.300, Windows)

Checks the open questions of `waiting-state-detection.md` with the same driver, now with `ask` and `plan` scenarios. Every event got a logging hook. `PreToolUse` also had the two candidate disjoint matchers, `^(?!(AskUserQuestion|ExitPlanMode)$).*` (logged as `[run]`) and `AskUserQuestion|ExitPlanMode` (`[wait]`).

**Question, default mode** (`--permission-mode default`; the first question answered with Enter, the second cancelled with Esc)

| t (s) | Event |
| --- | --- |
| 11.4 | `UserPromptSubmit` |
| 13.6 | `PreToolUse(AskUserQuestion)`, `PreToolUse[wait]` |
| 13.7 | `PermissionRequest(AskUserQuestion)`, as the question shows |
| 19.7 | `Notification:permission_prompt`, 6 s later |
| 21.8 | `PostToolUse(AskUserQuestion)`, 0.2 s after Enter |
| 23.5 | `PreToolUse(AskUserQuestion)`, `PreToolUse[wait]`, `PermissionRequest(AskUserQuestion)` |
| — | Esc: **no hook at all**, no `Stop`, no `idle_prompt` within 120 s; the screen shows "User declined to answer questions" and the input box |
| 167.5 | `SessionEnd` on `/exit` |

**Question, auto mode** (`--permission-mode auto`, the user's default): the same sequence, including `PermissionRequest(AskUserQuestion)` and the silent Esc.

**Plan, plan mode** (`--permission-mode plan`; option "Yes, manually approve edits")

| t (s) | Event |
| --- | --- |
| 13.8 | `PreToolUse(Write)`, `PreToolUse[run]`, `PostToolUse(Write)` (the plan file, no dialog) |
| 16.3 | `PreToolUse(ExitPlanMode)`, `PreToolUse[wait]` |
| 16.4 | `PermissionRequest(ExitPlanMode)` |
| 22.4 | `Notification:permission_prompt` |
| 24.6 | `PostToolUse(ExitPlanMode)`, 0.2 s after the choice |
| 26.9 | `PreToolUse(Write)`, `PreToolUse[run]`, `PermissionRequest(Write)` |

**Answers to the open questions**
- `PermissionRequest` fires for `AskUserQuestion` (default and auto mode) and for `ExitPlanMode` (plan mode), as the dialog shows. The existing mapping therefore already reports both dialogs as waiting. The `PreToolUse` split is not needed, and the adapter keeps one unmatched `PreToolUse` hook.
- The negative-lookahead matcher works in `--settings`: `[run]` fired for Write, ToolSearch and PowerShell and never for the two dialog tools; `[wait]` fired only for them. It stays on record in case a later CLI stops sending `PermissionRequest` for them.
- `PostToolUse` arrives 0.2 s after a question is answered or a plan approved. Orca's keystroke fallback is not needed on 2.1.300.
- Cancelling a question with Esc fires nothing, as Orca reports, so the session stays waiting until the next `UserPromptSubmit`. The user is the one who must act either way, so this is recorded as a known limit.
- Not checked: a rejected plan (presumably silent like the Esc), `ExitPlanMode` under auto mode, and `Elicitation`, which needs an MCP server that elicits.

**Mapping change**: added `PostToolUseFailure` → running (a tool that fails after an approved dialog sends no `PostToolUse`, so the session would otherwise stay waiting), `Elicitation` → waiting, `ElicitationResult` → running and `Notification:elicitation_url_dialog` → waiting. The last three come from the docs only.

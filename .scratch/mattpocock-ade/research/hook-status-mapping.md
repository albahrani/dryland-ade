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

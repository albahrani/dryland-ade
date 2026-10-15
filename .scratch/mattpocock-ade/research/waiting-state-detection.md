# Detecting "waiting for the user" in Claude Code (beyond permission prompts)

Scope: how Claude Code hosts tell that a session waits on the user for an `AskUserQuestion`, an `ExitPlanMode` plan approval, an MCP elicitation or a delayed `Notification`, how they avoid a "running" signal racing the "waiting" one, and how they go back to running. Extends `hook-status-mapping.md` (ticket 36 event order), `orca.md` and `multi-agent-hooks.md`; their findings are not repeated. Primary sources only, all fetched 2026-10-15.

Sources and versions:
- Claude Code docs: `https://code.claude.com/docs/en/hooks.md`, `hooks-guide.md`, `permission-modes.md`; `anthropics/claude-code` `CHANGELOG.md` (top entry 2.1.300).
- `stablyai/orca` @ `9943b570199a704acc91f685046032622e283fc2` (main, 2026-10-15).
- `manaflow-ai/cmux` @ `aac0986222d48368fd5a4e332b88a6a2f64922fd`.
- `BloopAI/vibe-kanban` @ `d5cbb5380fa0b32e98ef9b8d987f63decce4be3a`.
- `kbwo/ccmanager` @ `46fe720edfec98d9ab84bf8a326c35b45913fb2b`.
- `stravu/crystal` @ `1e18e0bc981225f75b5226f82a300fa741970c6f` (last commit 2026-02-26).
- `smtg-ai/claude-squad` @ `ce1ffb4392b01f38e2c4599c7c84d2a93973b138`.
- Conductor: closed source (see `multi-agent-hooks.md` §2). Nothing new is verifiable, so it is left out.

---

## 1. Claude Code itself (docs + changelog)

**Matchers** (hooks reference, "Matcher patterns"):
- `"*"`, `""` or no matcher matches everything.
- A matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is an **exact** name or a list of exact names: `AskUserQuestion|ExitPlanMode` matches exactly those two tools.
- Any other character makes it an **unanchored JavaScript regex**, tested with `RegExp.prototype.test`. So `^(?!(AskUserQuestion|ExitPlanMode)$).*` is a valid "every tool except these two" matcher, because JS regexes support lookahead.
- For `PreToolUse`, `PostToolUse`, `PostToolUseFailure` and `PermissionRequest`, the matcher filters on `tool_name`. `PreToolUse` explicitly lists `AskUserQuestion` and `ExitPlanMode` among the tools it matches.
- For `Elicitation` and `ElicitationResult`, the matcher filters on the MCP server name.

**Parallelism**: "All matching hooks run in parallel." (hooks reference, "Hook handler fields"). If two groups on the same event both match one tool call, they run concurrently and nothing orders them. A `dryland status running` group and a `dryland status waiting` group on the same `PreToolUse` would race. Hooks for *different* events are another matter: a synchronous `PreToolUse` hook must finish before the tool proceeds, so it finishes before that tool's `PermissionRequest`. This is inferred from PreToolUse's blocking decision control, not stated as an ordering guarantee.

**AskUserQuestion / ExitPlanMode**:
- Both "require user interaction" (hooks reference, "Tools that require user interaction"). A `PreToolUse` `"allow"` alone does not skip them; the hook must also return `updatedInput` with the answers.
- `AskUserQuestion` is on the list of "Actions no mode auto-approves", even in `bypassPermissions` (`permission-modes.md`). `ExitPlanMode` is not on that list.
- The hooks guide auto-approves `ExitPlanMode` with a **`PermissionRequest`** hook (matcher `ExitPlanMode`) and calls its dialog "the approval dialog". So the plan dialog goes through the permission flow, and `PermissionRequest` fires for it.
- Changelog 2.1.69: "Fixed interactive tools (e.g., `AskUserQuestion`) being silently auto-allowed when listed in a skill's allowed-tools, bypassing the permission prompt". This implies AskUserQuestion's dialog is also a permission prompt. Whether `PermissionRequest` fires for it on 2.1.300 is **not stated in the docs**; see Orca and cmux below.
- In `PostToolUse`, `ExitPlanMode`'s `tool_response` holds the approved plan. So a `PostToolUse` fires once the plan is approved.

**PermissionRequest vs Notification timing**:
- `PermissionRequest`: "Use this event when you need a signal the moment Claude asks for permission … Claude Code runs a Notification hook with the `permission_prompt` type only after the prompt has waited about six seconds."
- `PermissionRequest` does **not** fire for a sandboxed command's network request; only `Notification:permission_prompt` covers that.
- Notification table: `permission_prompt`, `elicitation_dialog` and `elicitation_url_dialog` fire after about **6 s** without typing. The timer starts when the dialog appears, and each keystroke pushes it back. `idle_prompt` fires about **60 s** after Claude finishes responding, if the user hasn't typed and no background agent is running. `agent_needs_input` fires only while agent view is open, or for an agent-team teammate's terminal setup question or the auto-mode classifier billing notice (after 6 s). It is **not** a signal for AskUserQuestion in an ordinary session.
- These types share their timing with desktop notifications. They still fire with `preferredNotifChannel: notifications_disabled`.
- A request that queues behind another open dialog keeps its own 6 s timer, so its Notification "can reach you while the request still waits behind the open dialog".

**Elicitation**: the `Elicitation` hook "runs when an MCP server requests user input mid-task", before Claude Code shows the dialog, and can answer it. `ElicitationResult` runs after the user responds, but not when a hook answered. `Elicitation` is the immediate counterpart to the delayed `Notification:elicitation_dialog`.

**Changelog items that matter here**:
- 2.0.37 added Notification matcher values; 2.0.45 added `PermissionRequest`.
- 2.1.198 added `agent_needs_input` / `agent_completed` for `claude agents`.
- 2.1.200: `AskUserQuestion` dialogs no longer auto-continue by default, so a question can now block forever.
- 2.1.233 fixed Notification hooks not firing for permission prompts under Desktop/VS Code.
- 2.1.288 fixed `idle_prompt` firing while background agents ran.

## 2. Orca (`stablyai/orca`)

Orca registers **one** managed command per event with `matcher: '*'`: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `StopFailure`, `SubagentStart/Stop`, `TeammateIdle`, `PostCompact`, `SessionStart`, and `SessionEnd` from 2.1.261 (`src/main/claude/claude-managed-hook-events.ts`). It registers **no `Notification` and no `Elicitation` hook for Claude**. Every event goes to one in-process listener that classifies it. A single classifier means no matcher-level race can happen.

Classification (`src/shared/agent-hook-listener/providers/claude-events.ts:112-135`):
- `PreToolUse` or `PermissionRequest` with `tool_name` AskUserQuestion → **waiting**. The code comment says: "Claude normally emits PreToolUse while AskUserQuestion is blocked; newer builds can also report it as PermissionRequest."
- Any other `PreToolUse`, plus `UserPromptSubmit`, `PostToolUse` and `PostToolUseFailure` → working. `PermissionRequest` → waiting. `Stop` / `StopFailure` → done.
- The tool name is normalised by `isAskUserQuestionTool` (`src/shared/agent-question-answered-intent.ts`).
- `ExitPlanMode` gets no special case. It is caught by the generic `PermissionRequest` → waiting, which agrees with the hooks guide.

Avoiding races:
- **Parallel sibling tools.** While a question waits, a `PostToolUse` from another tool in the same batch (different `tool_use_id`) must not clear the wait. The listener stores `waitingToolUseId` and returns the cached waiting state for a sibling's completion (`claude-events.ts:154-166`).
- **Sticky permission waits.** A later `working` event does not clear a `PermissionRequest` wait unless it is the approved tool resuming (same tool name, input and `tool_use_id`), an explicit prompt, or the owning child ending (`src/main/agent-hooks/server/server-claude-status-rules.ts:61-155`). AskUserQuestion waits are exempt from this stickiness ("tool name (not event) decides", line 86).
- `PermissionRequest` has no `tool_use_id`, so Orca copies it from the preceding `PreToolUse` (`attachClaudePermissionToolUseId`, lines 157-208).

Returning to running:
- Normally the next `PostToolUse` / `PreToolUse` / `UserPromptSubmit`.
- For AskUserQuestion, Orca adds a **keystroke inference** (`src/renderer/src/components/terminal-pane/agent-question-answered-inference.ts`; PR #9074, merged 2026-07-17). The file's comment says "answering an AskUserQuestion emits no event". A single-select Enter, or a digit for a declared option, clears the wait at once. Multi-select, multi-question, free-text and paste do not; they wait for the real hook. The main process re-checks the status baseline, so a real hook that arrives first wins.
- Per the PR, the wait otherwise "linger[ed] through post-answer model work". This suggests `PostToolUse(AskUserQuestion)` arrives late or not at all. **Unverified for 2.1.300.**
- A cancel (Esc / Ctrl+C) sends no hook ("Current Claude sends NO hook on a cancel", `claude-events.ts:87-91`). Orca infers interrupts from keystrokes (`agent-interrupt-inference.ts`).

## 3. cmux (`manaflow-ai/cmux`)

Hooks are injected with a wrapper's `--settings` (`CLI/CMUXCLI+ClaudeHookSettings.swift:9-101`):
- One group each, no matcher, for `SessionStart`, `Stop`, `StopFailure`, `SessionEnd`, `Notification` and `UserPromptSubmit`.
- One unmatched `PreToolUse` group; the other `PreToolUse` group is matcher `CronCreate` and is unrelated.
- A synchronous `PermissionRequest` hook with a 125 s timeout, which lets cmux answer it from its own Feed UI.
- `preferredNotifChannel: notifications_disabled`.
- The non-decision hooks go into an "app-owned ordered queue" through a spool, so cmux orders events itself rather than relying on hook timing.

State machine (`Sources/Mobile/AgentChat/AgentChatSessionRegistry+Lifecycle.swift:79-120`):
- `PreToolUse` whose tool is `AskUserQuestion` or `ExitPlanMode` → **needsInput**. The comment explains: "Claude emits AskUserQuestion and ExitPlanMode through PreToolUse. … treating every PreToolUse as working briefly overwrites the blocking state and leaves the sidebar waiting for Claude's delayed idle notification. … PermissionRequest/Notification still converge on the same state in permission modes that emit them."
- `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `PostToolUseFailure` → working. `PermissionRequest` and `Notification` → needsInput, except `Notification` with `notification_type: idle_prompt` (an "idle reminder"), which leaves the state unchanged. `Stop` → idle.
- The design spec states the same table (`docs/agent-session-tracking-spec.md`: `permissionRequest | askUserQuestion | exitPlanMode | notification -> needsInput`).
- `idle_prompt` is detected structurally from `notification_type`, not from the message text (`CLI/AgentHookNotificationPolicy.swift:217-229`). Other notifications are classified by keywords such as "permission" and "approve" (line 128).
- The delivery queue never drops `PreToolUse` for AskUserQuestion or ExitPlanMode as best-effort telemetry, because those calls "can surface Needs input" (`Sources/AgentHookDeliveryEvent.swift:73-91`).

Returning to running:
- The `pre-tool-use` handler "Clears 'Needs input' status … when Claude resumes work (e.g. after permission grant)" (`CLI/cmux.swift:32304-32340`). It ignores a `PreToolUse` that arrives after the turn's `Stop`, because a helper's tool call must not reopen a finished turn.

## 4. Vibe Kanban (`BloopAI/vibe-kanban`)

Vibe Kanban uses headless stream-json with the SDK control protocol and `--permission-prompt-tool=stdio` (`crates/executors/src/executors/claude.rs:166-195`). Its hooks are SDK callbacks, but the **matchers are Claude Code matchers** (`claude.rs:209-262`):
- In plan mode, `PreToolUse` matcher `^(ExitPlanMode|AskUserQuestion)$` routes to its approval UI, and `^(?!(ExitPlanMode|AskUserQuestion)$).*` auto-approves everything else.
- In approvals mode, `^(?!(Glob|Grep|NotebookRead|Read|Task|TodoWrite)$).*` asks.
- Otherwise only `^AskUserQuestion$` is routed. Without plan or approvals mode it passes `--disallowedTools=AskUserQuestion`.

This is a shipped, primary-source use of a **negative-lookahead regex matcher** to keep one `PreToolUse` from matching two handlers. Waiting is then explicit: `on_can_use_tool` sends AskUserQuestion to `handle_question` and other tools to `handle_approval` (`crates/executors/src/executors/claude/client.rs:279-320`). It returns to running when the callback returns.

## 5. PTY-screen hosts: ccmanager, claude-squad, Crystal

- **ccmanager** polls the xterm buffer every 100 ms (`src/services/sessionManager.ts:19`). In `src/services/stateDetector/claude.ts:132-175`:
  - **waiting_input** on `/(?:do you want|would you like).+\n+[\s\S]*?(?:yes|❯)/`, on `esc to cancel` (line 149), or on `\d+\.\s*deny\s*\(esc\)`.
  - **busy** on `esc to interrupt`, a spinner label or a token-stats line above the prompt box.
  - Otherwise idle, after 1.5 s of unchanged output.
  - `esc to cancel` is presumably the footer that catches AskUserQuestion and plan dialogs. **Inferred**: the dialog footers' wording was not checked here.
- **claude-squad** is unchanged since `multi-agent-hooks.md`: it matches only `"No, and tell Claude what to do differently"` (`session/tmux/tmux.go:255`). It likely misses AskUserQuestion. **Inferred, not tested.**
- **Crystal** marks a session `waiting` when its stream carries a JSON message of `type === 'prompt'` (`main/src/events.ts:884-891`). Approvals go through its MCP `--permission-prompt-tool`. No hook use.

---

## Summary: signal → state

| Signal | Orca | cmux | Vibe Kanban | ccmanager |
| --- | --- | --- | --- | --- |
| `PreToolUse` AskUserQuestion | waiting | needsInput | approval UI (waiting) | screen: "esc to cancel" |
| `PreToolUse` ExitPlanMode | working (waits via PermissionRequest) | needsInput | approval UI (plan mode) | screen |
| `PreToolUse` other | working | working (clears needsInput) | auto-approve / ask | screen: "esc to interrupt" |
| `PermissionRequest` | waiting (sticky unless the same tool resumes) | needsInput (decision hook) | n/a (`can_use_tool`) | screen: "Do you want" / "Deny (esc)" |
| `Notification` permission_prompt / elicitation | not registered | needsInput | n/a | n/a |
| `Notification` idle_prompt | not registered | no change | n/a | n/a |
| `Elicitation` | not registered | not registered | n/a | n/a |
| `PostToolUse` / `PostToolUseFailure` | working (except a sibling during a question) | working | n/a | screen |
| Answer typed into the question | keystroke inference → working | next PreToolUse/PostToolUse | callback returns | screen redraw |
| Race control | one classifier per event | one handler + ordered queue | disjoint regex matchers | n/a |

---

## Implications for Dryland's Claude Code adapter

Today `hookSettings` writes one hook group per `statusEvents` key. `PreToolUse: "running"` has no matcher, so an AskUserQuestion call reports running. If `PreToolUse:AskUserQuestion: "waiting"` were simply added beside it, both groups would match and **run in parallel** (docs), and two `dryland status` processes (about 80 ms each) would race. **Do not add a second matching group; make the matchers disjoint**, as Vibe Kanban does.

Recommended `CLAUDE_CODE.statusEvents`:

```ts
statusEvents: {
  UserPromptSubmit: "running",
  // Every tool except the two that open a dialog. JS regex path (has ^ ( ? ! $ .).
  "PreToolUse:^(?!(AskUserQuestion|ExitPlanMode)$).*": "running",
  // Exact-list path; disjoint from the matcher above.
  "PreToolUse:AskUserQuestion|ExitPlanMode": "waiting",
  PostToolUse: "running",          // after the answer / plan approval / permission grant
  PostToolUseFailure: "running",   // a rejected or failed call: the turn continues
  PermissionRequest: "waiting",
  Elicitation: "waiting",          // immediate; Notification:elicitation_dialog lags about 6 s
  ElicitationResult: "running",
  "Notification:permission_prompt": "waiting",        // only signal for sandbox network prompts
  "Notification:elicitation_dialog|elicitation_url_dialog": "waiting",
  Stop: "idle",
  "Notification:idle_prompt": "idle",
  SessionEnd: "ended",
}
```

Notes:
- **`hookSettings` parsing.** `event.split(":")` takes only the first two parts, so a matcher containing `:` would be truncated. Neither matcher above has one. Splitting on the first `:` only would be more robust.
- **ExitPlanMode is reported twice.** It produces `PreToolUse` (waiting) and then `PermissionRequest` (waiting). Both say waiting, so they do not conflict. AskUserQuestion may also get a `PermissionRequest` (Orca: "newer builds"). Also harmless.
- **Ordering across events.** `PreToolUse` → `PermissionRequest` → `PostToolUse` are separate events. Synchronous hooks keep them ordered, because the tool waits for its `PreToolUse` hook. Keep these hooks synchronous: never `async: true`.
- **A late Notification after an answer.** `Notification:permission_prompt` fires after about 6 s of inactivity. If the user answers just as it fires, a stale "waiting" could land after `PostToolUse`. Dryland could ignore `Notification:*` waiting unless the session's last state was not `running`-from-`PostToolUse`. Simpler: accept it, since the next tool event corrects it. `agent_needs_input` is left out: in a normal terminal session it only covers teammate setup and billing notices.
- **Returning from a question.** Expect `PostToolUse(AskUserQuestion)` once the dialog is answered, and `PostToolUse(ExitPlanMode)` once the plan is approved (docs). If a real-CLI check shows `PostToolUse` arrives late (Orca's PR), consider Orca's keystroke fallback. Dryland owns the PTY, so a lone Enter written while the state is waiting-on-AskUserQuestion can switch the badge to running optimistically.
- **Cancel / Esc on a dialog.** No hook fires (Orca), so the badge stays waiting until the next `UserPromptSubmit`. That is acceptable: the CLI is in fact waiting at its prompt.

## Unverified / flagged items

- Whether 2.1.300 fires `PermissionRequest` for `AskUserQuestion`. Orca says newer builds do; cmux says it comes "through PreToolUse"; the docs are silent.
- Whether `PostToolUse(AskUserQuestion)` fires promptly after the answer. Orca's PR #9074 implies it does not ("emits no event").
- What hook a rejected plan (ExitPlanMode "No, keep planning") or an Esc'd question emits: `PostToolUseFailure`, `PermissionDenied`, or nothing.
- That a negative-lookahead matcher works in a **settings-file** command hook, not just in the SDK's `hookCallbackIds`. The docs' "contains any other character → JS regex" rule implies it does; Vibe Kanban only proves the SDK path.
- That `Elicitation` fires before the dialog in an interactive TUI session, and that `ElicitationResult` fires on a user answer. These come from the docs only.
- Whether `ExitPlanMode` raises a dialog (and so `PermissionRequest`) in `bypassPermissions` or auto mode.
- ccmanager's `esc to cancel` matching AskUserQuestion and plan dialogs; claude-squad missing them. Both inferred from code, not run.
- Conductor: closed source, nothing verifiable.

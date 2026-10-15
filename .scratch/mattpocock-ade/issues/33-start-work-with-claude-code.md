# Start work with Claude Code

Type: task
Status: resolved
Blocked by: 26, 28, 32

Spec: [spec](../spec.md), user stories 41, 42, 45, 67. "Agent adapters", "Worktrees and linking". ADR 0006.

## What to build

The core actuator: the user picks an Agent CLI on a ticket and Dryland creates the ticket's worktree and opens the CLI there in an embedded terminal, with the recommended skill command typed but not submitted.

This introduces the Agent adapter seam: a declarative entry per Agent CLI (binary, launch arguments, skill-command syntax, initial-prompt handling, hook-injection method, status-event mapping) with small code hooks only where needed. The first entry is Claude Code. The launch is the interactive CLI in a PTY; no `-p` or initial-prompt-argument launch, because those submit immediately. The pre-typed command comes from the rule engine's next step for that ticket.

Spawned PTYs get a `dryland` launcher on `PATH` and the environment variables `DRYLAND_SESSION_ID` and `DRYLAND_PANE_KEY` (`DRYLAND_PORT` and `DRYLAND_TOKEN` are added by the live reporting ticket). Dryland records session, worktree and ticket at spawn.

**First step: verify against the real CLI.** The Claude Code design comes from documentation only. On the dev machine (Claude Code installed), verify that the interactive launch accepts a pre-typed, unsubmitted command and how the interactive trust prompt behaves in a fresh worktree. Record findings next to the earlier hook research and adjust the adapter entry to what was observed.

## Acceptance criteria

- [x] Findings from the real Claude Code run (pre-typed unsubmitted command, trust prompt) are recorded in the effort's research notes
- [x] Starting work on a ticket creates its `<effort>/<NN>-<slug>` worktree, or reuses it if it exists
- [x] Claude Code opens in that worktree with the recommended skill command typed and not submitted
- [x] The session runs under the user's own CLI login; no API key is read or set
- [x] `dryland` resolves on `PATH` inside the session and reports the main checkout's tickets
- [x] Contract tests with a fake-CLI stub executable assert the launch command, the working directory, the environment variables and the pre-typed text, and that nothing is submitted
- [x] An Agent CLI whose binary is not installed is shown as unavailable instead of failing at launch
- [x] Session, worktree and ticket are recorded at spawn and visible on the session tab

## Answer

Built in 28263da, hardened in 05db578. A ticket tab offers "Start with <Agent CLI>". It creates or reuses the ticket's <effort>/<NN>-<slug> worktree (core worktreeForTicket, reusing only name-linked worktrees) and opens the CLI there in a terminal tab labelled "<agent> <map>/<NN>". A header shows agent, ticket, worktree and session id, as recorded at spawn. The pre-typed text is the command of the best next step pointing at the ticket (core commandForTicket); when none does, nothing is typed. Agent adapter seam: packages/core/src/agent-adapter.ts. It is declarative (binary, launch args, skill prefix, initial-prompt mode, blocking prompts, hook injection, status events), and Claude Code is the first entry. Hook injection and the status map are declared but only acted on by ticket 36. Real-CLI findings (Claude Code 2.1.300, Windows) are in research/hook-status-mapping.md. A whole-string PTY write and a bracketed paste are dropped, so the pre-typer (desktop/src/main/pretype.ts) sends one key every 15 ms. It starts once output has been quiet for 500 ms and never while the quiet window shows a blocking dialog (trust dialog, matched on escape-stripped text). A worktree of a trusted repo is not prompted. An untrusted one shows the trust dialog, which Dryland neither answers nor pre-empts: no trust entry is written. The same was checked through the built app with the real CLI. Sessions get DRYLAND_SESSION_ID, DRYLAND_PANE_KEY (the terminal id) and the launcher dir first on PATH; otherwise the environment is inherited unchanged, with no credential read or set. The dryland launcher (sh and .cmd, desktop/src/main/launcher.ts) is written to userData/bin at startup. It runs out/main/dryland.js, the CLI that electron-vite now also builds, with the app's Electron in node mode. An Agent CLI not found on PATH (core findExecutable, now shared with doctor) is listed as unavailable with a reason, and its button is disabled. Tests: core agent-adapter.test.ts (real recorded screen bytes as fixtures); desktop work.test.ts (fake PTY, real git, stub binary); launcher.test.ts (real launcher and CLI through the shell, path with spaces); e2e start-work.spec.ts (stub claude on PATH runs dryland ticket list inside the session, echoes keys, reports any Enter). Hardening (05db578): every blocking dialog is now taken from the real CLI. The first-run theme picker, the external CLAUDE.md imports dialog and the custom API key dialog were each recorded in a throwaway CLAUDE_CONFIG_DIR and kept as test fixtures. The guessed login pattern was dropped, because a CLI that is not logged in opens to its input box. Sessions also drop the variables a parent Claude Code session sets (the adapter's parentSessionEnv). Of these, CLAUDE_CODE_CHILD_SESSION had turned transcripts off whenever Dryland ran inside Claude Code. The user's own CLAUDE_CODE_* settings still pass through. Known limits: the launcher lives in userData/bin until ticket 57 (noted there); DRYLAND_PORT and DRYLAND_TOKEN come with ticket 35; if the user types during the first ~1.5 s, their keys can mix with the pre-typed ones, so ticket 44 now has an acceptance criterion that typing cancels pre-typing and auto-submit; a startup dialog not listed in the adapter would swallow the pre-typed command, though nothing is ever submitted; the session record lives only in this run of the app (WorkStarter.sessions() is for the Sessions view, ticket 37). Tests pass on Windows and on Linux (pnpm test:linux and pnpm test:e2e:linux).

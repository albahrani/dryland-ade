# Verify Copilot hooks and trust prompt in interactive mode

Type: task
Status: resolved
Blocked by: 17

## Question

The ADE launches Copilot CLI **interactively** in a PTY, with the skill command typed in but not submitted. Ticket 17 only verified `copilot -p`. Does the Orca-style setup also hold in interactive mode? If it doesn't, the adapter's status source has to change: fall back to `session-store.db` or PTY heuristics, or accept the trust prompt.

Human checklist (HITL, the TUI needs a real terminal). Back up `~/.copilot/config.json` and `~/.copilot/hooks/` first.

1. Create a temp git repo and `git worktree add` a fresh worktree whose path is **not** in `trustedFolders`.
2. Put the env-gated hook file from `research/hook-status-mapping.md` (section "Verification") at `~/.copilot/hooks/ade-test.json`. Have every event append a line with its name to a log file. Include at least `sessionStart`, `userPromptSubmitted`, `notification`, `permissionRequest`, `agentStop`, `sessionEnd`.
3. **Untrusted run:** in a terminal with `ADE_PANE_KEY=1` set, `cd` into the worktree and run `copilot`. Record whether a trust prompt appears, and which hook lines get logged before and after you answer it.
4. **Trusted run:** append the worktree realpath to `trustedFolders`, then start `copilot` again. Confirm that no trust prompt appears.
5. In that session, submit a prompt that needs a tool permission (e.g. "create a file x.txt"), wait at the permission prompt, approve it, let it finish, then `/exit`. Check that `userPromptSubmitted`, `notification`/`permissionRequest` (waiting), `agentStop` (idle) and `sessionEnd` (ended) were logged in that order.
6. **Inert check:** repeat a short session without `ADE_PANE_KEY`. Nothing should be logged.
7. **Pre-typed command:** start `copilot`, type `/grilling` without pressing Enter, and confirm that no prompt-submitted event fires until Enter.
8. Restore the backups and remove the temp repo.

Record the observed events, the prompt behaviour and the Copilot CLI version in `research/hook-status-mapping.md` under a new "Interactive verification" section.

## Answer

Done on Windows, Copilot CLI 1.0.96; full log in `research/hook-status-mapping.md` ("Interactive verification").

- **Hooks fire in interactive mode** via the global env-gated `~/.copilot/hooks/<ade>.json`. Without `ADE_PANE_KEY` it stays inert.
- **Trust prompt:** an untrusted worktree shows "Yes" / "Yes, and remember…" / "No". With the worktree realpath appended to `trustedFolders` there is no prompt. Removing the entry restored `config.json` byte-identically.
- **Status mapping confirmed:** running = `userPromptSubmitted`/`preToolUse`/`postToolUse`; waiting = `permissionRequest` + `notification` (`notification_type: permission_prompt`); idle = `agentStop` (no `agent_idle` notification within 60 s, so don't rely on it); ended = `sessionEnd` (`reason: user_exit`).
- **`sessionStart` is lazy:** it fires at the first submitted prompt, not at launch. The trust prompt and a typed but unsubmitted `/grilling` emit nothing. So the ADE derives "launched / waiting for user" from its own PTY spawn and learns the Copilot `sessionId` only at first submit.
- Every payload carries `cwd` (worktree, so ticket link) and `sessionId`; `agentStop` also carries `transcriptPath`.
- Adapter design from [Supported Agent CLIs and adapter seam](05-agent-cli-adapters.md) stands. No new tickets.

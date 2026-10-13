# Start work with Claude Code

Type: task
Status: ready-for-agent
Blocked by: 26, 28, 32

Spec: [spec](../spec.md), user stories 41, 42, 45, 67. "Agent adapters", "Worktrees and linking". ADR 0006.

## What to build

The core actuator: the user picks an Agent CLI on a ticket and Dryland creates the ticket's worktree and opens the CLI there in an embedded terminal, with the recommended skill command typed but not submitted.

This introduces the Agent adapter seam: a declarative entry per Agent CLI (binary, launch arguments, skill-command syntax, initial-prompt handling, hook-injection method, status-event mapping) with small code hooks only where needed. The first entry is Claude Code. The launch is the interactive CLI in a PTY; no `-p` or initial-prompt-argument launch, because those submit immediately. The pre-typed command comes from the rule engine's next step for that ticket.

Spawned PTYs get a `dryland` launcher on `PATH` and the environment variables `DRYLAND_SESSION_ID` and `DRYLAND_PANE_KEY` (`DRYLAND_PORT` and `DRYLAND_TOKEN` are added by the live reporting ticket). Dryland records session, worktree and ticket at spawn.

**First step: verify against the real CLI.** The Claude Code design comes from documentation only. On the dev machine (Claude Code installed), verify that the interactive launch accepts a pre-typed, unsubmitted command and how the interactive trust prompt behaves in a fresh worktree. Record findings next to the earlier hook research and adjust the adapter entry to what was observed.

## Acceptance criteria

- [ ] Findings from the real Claude Code run (pre-typed unsubmitted command, trust prompt) are recorded in the effort's research notes
- [ ] Starting work on a ticket creates its `<effort>/<NN>-<slug>` worktree, or reuses it if it exists
- [ ] Claude Code opens in that worktree with the recommended skill command typed and not submitted
- [ ] The session runs under the user's own CLI login; no API key is read or set
- [ ] `dryland` resolves on `PATH` inside the session and reports the main checkout's tickets
- [ ] Contract tests with a fake-CLI stub executable assert the launch command, the working directory, the environment variables and the pre-typed text, and that nothing is submitted
- [ ] An Agent CLI whose binary is not installed is shown as unavailable instead of failing at launch
- [ ] Session, worktree and ticket are recorded at spawn and visible on the session tab

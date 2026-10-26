# The `dryland` CLI is the only agent surface; session state has its own channel

Agents reach state through the `dryland` command only: no MCP, no file paths. A plain CLI on `PATH` works in every Agent CLI and in outside terminals. Prose goes on stdin. Output is short plain text for agents, `--json` on every command for the app and hooks, and a non-zero exit with an error that states the next action or the cap or rule that was broken.

## Decisions

- **Commands**: the ticket, map, fog, state, export, migrate, init and doctor groups, plus the session-state report. `ticket show` prints the summary and Description, `--log` adds the Analysis log and `--history` adds revisions. A release-notes command collates solution summaries by type over a range, with no model. The full surface is set during build.
- **Session-state channel**: a report of session id, state and timestamp, with no payload. States are running, waiting, idle and ended; unknown states are rejected. Claude Code and Copilot CLI hooks send it. It feeds badges, waiting counts, waiting-first ranking and the session index `lastState`.
- **Hook-sourced status only**: guessing a state from PTY output, pressing Enter after a pre-typed command, adopting sessions typed in a plain terminal and `session.started` are removed.
- **Supported Agent CLIs**: Claude Code and Copilot CLI only; the launch-only tier for other CLIs is removed.
- **Doctor**: missing hooks are a `dryland doctor` error. It also reports isolation enforcement and absorbs the agent CLI compatibility check.

## Consequences

- Supersedes ADR 0008. `ticket.changed`, the lock file, the localhost listener for ticket changes and the live-events panel are removed; the UI reads the engine directly.
- A Live event is now a session state report, not a ticket change.

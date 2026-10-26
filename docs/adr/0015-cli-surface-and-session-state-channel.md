# The `dryland` CLI is the only agent surface; session state has its own channel

Agents reach state through the `dryland` command only: no MCP, no file paths. A plain CLI on `PATH` works in every Agent CLI and in outside terminals. Every write is one structured document on stdin, validated against a schema; prose appears only inside fields meant to hold it (a Report, a summary). Output is a structured document by default, carrying a `$schema` id, with the meaning of each field in the command's help, so an agent never guesses a format; `--text` renders it for people, and the app reads the engine directly. A failed command exits non-zero with an error that states the next action or the cap or rule that was broken.

## Decisions

- **Write pipeline**: every write command runs three steps. *Parse* checks the document against its schema (syntax). *Check* applies the content rules: caps, lint, claim, gates, existence, acyclic edges (semantics). *Apply* appends the event as one compare-and-set. `--check` stops after the second step and writes nothing. Each problem prints as one diagnostic line with the field path, a rule id, what was wrong and the fix, in the style of compiler output, and the exit code says which step failed. Agents submit data, never code, so the engine runs nothing an agent wrote.
- **Everything that writes is a document**, however small (a claim is `{ "ticket": "effort/03" }`), so no write bypasses the content rules. Reads (`show`, `list`, map views, `status`, `doctor`) take a reference argument and `--json`.
- **Learning the shape**: each command's help prints a valid example document, and the tracker primer embeds the same examples, both generated from the schema so they cannot drift. There is no separate schema command.

- **Commands**: the ticket, map, fog, state, export, migrate, init and doctor groups, plus the session-state report. `ticket show` prints the summary and Description, `--log` adds the Analysis log and `--history` adds revisions. A release-notes command collates solution summaries by type over a range, with no model. The full surface is set during build.
- **Session-state channel**: a report of session id, state and timestamp, with no payload. States are running, waiting, idle and ended; unknown states are rejected. Claude Code and Copilot CLI hooks send it. It feeds badges, waiting counts, waiting-first ranking and the session index `lastState`.
- **Hook-sourced status only**: guessing a state from PTY output, pressing Enter after a pre-typed command, adopting sessions typed in a plain terminal and `session.started` are removed.
- **Supported Agent CLIs**: Claude Code and Copilot CLI only; the launch-only tier for other CLIs is removed.
- **Doctor**: missing hooks are a `dryland doctor` error. It also reports isolation enforcement and absorbs the agent CLI compatibility check.

## Consequences

- Supersedes ADR 0008. `ticket.changed`, the lock file, the localhost listener for ticket changes and the live-events panel are removed; the UI reads the engine directly.
- A Live event is now a session state report, not a ticket change.

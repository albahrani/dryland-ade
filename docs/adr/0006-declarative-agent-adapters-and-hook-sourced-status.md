# Declarative Agent adapters, interactive PTY launch, status from hooks

Dryland drives Agent CLIs only through their own binaries under the user's subscription login. Each supported CLI is described by an **Agent adapter**: a declarative entry in the pure core (binary, launch arguments, skill-command syntax, initial-prompt handling, hook-injection method, status-event mapping), with small code hooks only where a first-class CLI needs them. A session is the interactive CLI spawned in a PTY inside the ticket's worktree, with the recommended skill command typed but not submitted, which is the same as a human at a terminal. Session status comes from the CLI's own hooks, which call `dryland status`.

Rejected: the Claude API and Agent SDK (hard product constraint); headless `-p` or initial-prompt-argument launch (submits immediately and loses interactivity); Orca's structured `stream-json` mode (out of v1); transcript parsing as the primary status source (Claude Code's transcript format is unofficial and unstable); tmux or screen scraping.

## Decisions

- **Tiers**: Claude Code and GitHub Copilot CLI are first-class with a full, verified adapter. All other Agent CLIs are best-effort: launch plus pre-typed command, no status guarantee.
- **Launch**: no auto-submit by default; it is an opt-in setting. Spawned PTYs get the `dryland` launcher on `PATH` and `DRYLAND_PORT`, `DRYLAND_TOKEN`, `DRYLAND_SESSION_ID` and `DRYLAND_PANE_KEY`.
- **Hook injection**: per launch or worktree-local where the CLI offers it (Claude Code: per-launch settings flag). Otherwise a narrow user-level write under ADR 0005 (Copilot CLI).
- **Session states**: launched, running, waiting, idle, ended. "Launched" always comes from Dryland's own PTY spawn, because Copilot's session-start hook fires only at the first submitted prompt. Running is prompt-submitted and tool-use events, waiting is permission-request and permission/needs-input notifications, idle is the stop event, ended is the session-end event. Copilot's idle notification is not relied on.
- **No hooks**: status falls back to PTY heuristics and is marked approximate. Transcripts are a best-effort fallback only.
- **Live only**: reporting is fire-and-forget and a silent no-op when the app is closed (ADR 0008). Status is never persisted; on start Dryland rebuilds from files, git and the tracker.
- **Session-to-ticket link**: recorded at spawn (session, worktree, ticket). A session started by hand in a Dryland-created worktree links by working directory. Branches Dryland did not create are unlinked, with a commit trailer as fallback link.
- **Orca reuse** (MIT, attributed): the config-table pattern only, not its UI or structured mode.

## Consequences

- Adding a best-effort CLI is one config entry.
- Interactivity is limited to what the CLI's own TUI offers; Dryland cannot answer prompts on the user's behalf.
- The Copilot mapping is verified interactively on Windows. The Claude Code mapping is from documentation and is verified as the first implementation ticket of that adapter.
- Whether the providers' terms permit driving the Agent CLIs this way was addressed and decided; the analysis is not kept in the repo.

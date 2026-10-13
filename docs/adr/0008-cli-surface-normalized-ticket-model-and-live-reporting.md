# `dryland` CLI surface, one normalized ticket model, localhost live reporting

ADR 0001 made the CLI the single write path for tickets. This records its shape. The CLI has five command groups, exposes one normalized ticket model over all three backends, and tells a running app what happened over a localhost channel. A plain CLI on `PATH` was chosen over an MCP server: every Agent CLI can run a command, and it works in outside terminals. Storing events, webhooks and stored tracker tokens were rejected: the repo and the tracker are the source of truth.

## Decisions

- **Commands**: `ticket` (create, list, show, claim, release, resolve, block, comment, plus named triage/label subcommands), `map` (show, frontier, index), `worktree` (create, list, prune), `status` (report a session event; called by hooks), `doctor` (setup, tracker, hooks, `PATH`, user-config install/status/remove, `--compat-prompt`).
- **Output**: short plain text written for agents by default; `--json` on every command for the app and hooks; non-zero exit on failure, with an error that states the next action.
- **Normalized ticket model**: id, title, type (research, prototype, grilling, task, or none), state (open, claimed, resolved), claimant, blockers (a known list, or unknown), parent map, triage role, body, answer, comments, and an opaque `raw` field for backend extras that the rules never read.
- **Local-markdown format**: unchanged from the default skills (`Type:`, `Status:`, `Blocked by:`, `## Answer`, `## Comments`). The CLI adds no fields, so files stay hand-readable and skill-compatible.
- **Backend mapping**: on GitHub/GitLab a claim is the assignee, blocking uses native dependencies where available, and the map index is the map issue's body. GitLab without Premium keeps blocking in a `Blocked by:` body line. Missing or unauthenticated `gh`/`glab` fails clearly and is reported by `dryland doctor`; tokens are never requested or stored.
- **Live reporting**: the app listens on `127.0.0.1` on a random port and writes the port and a random per-launch token to a lock file in a per-user app directory. `dryland status` POSTs an authenticated event and exits 0 silently when there is no lock file or the connection fails.
- **Events**: JSON `{session_id, kind, timestamp, payload?}`. Kinds are `session.started`, `session.running`, `session.waiting`, `session.idle`, `session.ended` and `ticket.changed`, which every mutating `ticket` and `map` command emits. Hooks map each CLI's native events to the session kinds (ADR 0006).

## Consequences

- Events are not stored. The app rebuilds its state from files, git and the tracker on start, and refreshes tickets on `ticket.changed`.
- GitHub and GitLab changes made outside `dryland` appear only on the next poll (window focus or timer).
- A session's status is unknown while the app is closed; nothing is queued for later.
- The channel accepts only local, token-authenticated requests, and the token changes on every app launch.

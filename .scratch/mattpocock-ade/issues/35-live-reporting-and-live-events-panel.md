# Live reporting and the live-events panel

Type: task
Status: resolved
Blocked by: 24, 25, 30

Spec: [spec](../spec.md), user stories 23, 53, 68. "Live reporting". ADR 0008.

## What to build

The channel from the `dryland` CLI to the running app.

The app listens on `127.0.0.1` on a random port. Port and a random per-launch token are written to a lock file in a per-user app directory. `dryland status` POSTs an authenticated Live event and exits 0 silently when there is no lock file or the connection fails: reporting is fire-and-forget and the CLI works with the app closed.

Event shape: `{session_id, kind, timestamp, payload?}`. Kinds: `session.started`, `session.running`, `session.waiting`, `session.idle`, `session.ended`, and `ticket.changed`, which every mutating `ticket` and `map` command emits.

In the app, `ticket.changed` refreshes the tickets tree, and the live-events panel shows session events and every Dryland write. The panel has three modes: expanded, one line, hidden. Events are never stored. Spawned PTYs now also get `DRYLAND_PORT` and `DRYLAND_TOKEN`.

## Acceptance criteria

- [x] With the app running, a `dryland ticket claim` in any terminal refreshes the tickets tree and shows a line in the live-events panel
- [x] Every mutating `ticket` and `map` command emits `ticket.changed`, from the shared command layer so that every tracker backend emits it without backend-specific code
- [x] `dryland status` with the app closed, or with a stale lock file, exits 0 with no output and does not slow the calling command noticeably
- [x] A request without the correct token is rejected and shows nothing in the app
- [x] The listener binds to `127.0.0.1` only
- [x] The lock file is removed on quit and replaced on next launch with a new port and token
- [x] The panel switches between expanded, one line and hidden, and the choice is remembered
- [x] No event is written to disk; after a restart the panel is empty

## Answer

Built in 0a73896 and 4062a8f. Core live-reporting.ts owns the wire protocol: startLiveListener binds 127.0.0.1 on a random port, writes {port, token} atomically to live.json in a per-user app dir (%LOCALAPPDATA%\Dryland, ~/Library/Application Support/Dryland, $XDG_STATE_HOME/dryland; DRYLAND_APP_DIR overrides, used by tests), checks a Bearer token in constant time, validates events (400 on malformed, 64 KB cap), and on close removes the lock file synchronously only if it is still its own. sendLiveEvent tries DRYLAND_PORT/DRYLAND_TOKEN first, then the lock file, with a 300 ms timeout, and never throws. CLI: new `dryland status <kind> [--session <id>] [--payload <json>]`, silent and exit 0 when no app answers; the shared COMMANDS table marks each mutating ticket/map command with a `changed` hook and run() emits ticket.changed {command, ticket|map} after success, so any backend reports without backend code. Desktop: the main process starts the listener before any terminal, passes DRYLAND_PORT/DRYLAND_TOKEN to PTYs, refreshes the tree on ticket.changed, forwards every event to a LiveEventsPanel (expanded / one line / hidden, mode remembered in ui-state; events kept in memory only, newest 500). Tests: core listener/client over real HTTP, CLI via the bundle against a real listener, ui-state, and e2e (outside-terminal claim, panel modes, restart, lock file gone after quit, PTY env). Known limits: no single-instance lock, so a second app instance takes over the lock file (tickets 41/42); ticket.changed carries no repo, so the app refreshes on writes in any repo; a port that accepts connections but never answers adds up to 300 ms per event to each mutating command.

# Live reporting and the live-events panel

Type: task
Status: ready-for-agent
Blocked by: 24, 25, 30

Spec: [spec](../spec.md), user stories 23, 53, 68. "Live reporting". ADR 0008.

## What to build

The channel from the `dryland` CLI to the running app.

The app listens on `127.0.0.1` on a random port. Port and a random per-launch token are written to a lock file in a per-user app directory. `dryland status` POSTs an authenticated Live event and exits 0 silently when there is no lock file or the connection fails: reporting is fire-and-forget and the CLI works with the app closed.

Event shape: `{session_id, kind, timestamp, payload?}`. Kinds: `session.started`, `session.running`, `session.waiting`, `session.idle`, `session.ended`, and `ticket.changed`, which every mutating `ticket` and `map` command emits.

In the app, `ticket.changed` refreshes the tickets tree, and the live-events panel shows session events and every Dryland write. The panel has three modes: expanded, one line, hidden. Events are never stored. Spawned PTYs now also get `DRYLAND_PORT` and `DRYLAND_TOKEN`.

## Acceptance criteria

- [ ] With the app running, a `dryland ticket claim` in any terminal refreshes the tickets tree and shows a line in the live-events panel
- [ ] Every mutating `ticket` and `map` command emits `ticket.changed`, from the shared command layer so that every tracker backend emits it without backend-specific code
- [ ] `dryland status` with the app closed, or with a stale lock file, exits 0 with no output and does not slow the calling command noticeably
- [ ] A request without the correct token is rejected and shows nothing in the app
- [ ] The listener binds to `127.0.0.1` only
- [ ] The lock file is removed on quit and replaced on next launch with a new port and token
- [ ] The panel switches between expanded, one line and hidden, and the choice is remembered
- [ ] No event is written to disk; after a restart the panel is empty

# Session-state channel

Type: task
Status: resolved
Blocked by: 40

## Question

**What to build:** the hook-fed session states (running, waiting, idle, ended) as their own channel, feeding badges, waiting counts, waiting-first ranking and the session index. The deletions that used to be here moved to ticket 40.

- [x] Schema is session id, state, timestamp; unknown states are rejected
- [x] Claude Code and Copilot hooks send it, and badges, waiting counts, waiting-first ranking and the session index `lastState` read it
- [x] A Live event in the code and glossary means a session state report
- [x] doctor reports missing hooks as an error

## Answer

The live channel is now a session state report: `{ session_id, state, timestamp }` plus the optional Agent CLI session id the session index needs (ADR 0010). `state` is running, waiting, idle or ended; the listener and `dryland status <state>` reject anything else, and `--payload` is gone. `ticket.changed` and the `changed` hook on ticket and map commands are removed, so the desktop refreshes on session state changes only and reads ticket changes through its file watcher. `SESSION_STATE_EVENTS` and `sessionStateOf` went with the `session.*` kinds; hooks now run `dryland status running` and so on. Badges, ranking and the session index `lastState` read `event.state` directly. The glossary already defined a Live event this way, and `dryland doctor` already fails on a missing or outdated hook file, so neither needed a change.

Commit: 0e0b035.

The timestamp must be an ISO date-time; the listener rejects any other.

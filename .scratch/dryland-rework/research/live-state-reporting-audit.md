# Live state reporting audit

Ticket: dryland-rework/04. Read-only audit of `packages/core`, `packages/cli`, `packages/desktop`. Paths are relative to the repo root; ADR 0008 and the GLOSSARY "Live event" entry define the intent.

## Bottom line

- The channel only carries two things: **session state** (from Agent CLI hooks) and **"a ticket changed"** (from every mutating `dryland` command).
- Nothing in the CLI, claims, ticket writes or the persisted session index *requires* the channel. The CLI never reads an event; `dryland status` is a silent no-op with no app.
- The one non-UI thing that depends on it is the **desktop main process**: its in-memory session state feeds the next-step rules ("waiting ranks first", "stale claim") and writes `lastState` into the session index (feeds the "paused" classification).
- Everything else is UI-only: the live-events panel, the status-bar toggle and settings option, session badges, waiting counts, quit-dialog ordering, instant ticket refresh.

## 1. Pipeline

| Part | Where | Notes |
| --- | --- | --- |
| Schema | `packages/core/src/live-reporting.ts` `LiveEvent`, `LIVE_EVENT_KINDS`, `parseLiveEvent` | `{session_id, kind, timestamp, agent_session_id?, agent?, cwd?, pane?, payload?}`. Kinds: `session.started/running/waiting/idle/ended`, `ticket.changed`. Payload of `ticket.changed`: `{command, ticket?, map?}`. |
| State mapping | `packages/core/src/agent-adapter.ts` `SESSION_STATE_EVENTS`, `sessionStateOf`, `statusEvents`, `hookSettings` | Native CLI hook event to session kind. `session.started` maps to no state (`sessionStateOf` returns null). Hooks run `dryland status session.<x>` with a 5 s timeout. |
| Listener | `live-reporting.ts` `startLiveListener` | `127.0.0.1`, random port, per-launch UUID bearer token, `POST /events` only, 64 KiB cap, timing-safe compare. |
| Lock file | `liveLockFile()`: `%LOCALAPPDATA%\Dryland\live.json`, macOS `Application Support/Dryland`, Linux `$XDG_STATE_HOME/dryland`; `DRYLAND_APP_DIR` overrides | `{port, token}`, renamed into place atomically (Windows EPERM retry loop), removed on close if token still matches. |
| Sender | `live-reporting.ts` `sendLiveEvent`, `post` | Tries `DRYLAND_PORT`/`DRYLAND_TOKEN` from env first, then the lock file. 300 ms timeout. Never rejects. |
| CLI senders | `packages/cli/src/main.ts`: `reportLiveEvent` (~l.213), `status` command (~l.460), `changed` hook on `COMMANDS` | `ticket claim/release/create/resolve/block/comment...` and `map index` send `ticket.changed` after success. `status <kind>` sends session events (called by hooks, also by hand). |
| Hand-started CLI | `reportLiveEvent` adds `agent`, `cwd`, `pane` when `DRYLAND_AGENT` is set | App adopts the session on its first event (`adoptHandStarted`, `desktop/src/main/index.ts` ~l.297, `work.adoptManual`). |
| App wiring | `desktop/src/main/index.ts` l.925-927 (start listener, put port/token in `ptyEnv`), l.1070 (close) | The in-app terminals and sessions inherit the env, so events find the right app even with several running. |
| Test coverage | `core/test/live-reporting.test.ts`, `cli/test/live-reporting.test.ts`, `desktop/e2e/live-events.spec.ts`, `desktop/test/session-status.test.ts`, `session-recording.test.ts` | |

## 2. Event flow inside the desktop app

`onLiveEvent` (`desktop/src/main/index.ts` l.288) does two things:

1. Forwards the raw event to the window as `live:event` (panel only).
2. Queues `applyLiveEvent` (l.311), in order: adopt hand-started session, `recorder.apply` (session index), `status.apply` (in-memory state), then `sendSessionStates()` if state changed, and `refresh()` if state changed or kind is `ticket.changed`.

Other state sources that exist without events:
- `status.launched` / `status.exited` from Dryland's own spawn and PTY exit (`session-status.ts`, `terminalEnded` l.270).
- `activity-status.ts`: a guessed running/idle (never waiting) for CLIs with no hooks, flagged `statusApproximate`.

## 3. Consumers and what each loses without events

| Consumer | Source | Without live events |
| --- | --- | --- |
| Live-events panel | `renderer/src/LiveEventsPanel.tsx`, `App.tsx` l.221-222 (500-event buffer), `onLiveEvent` l.317 | **Everything**: it is a pure log of events. Only consumer of the raw stream. Debug/transparency value only. |
| Panel controls: status-bar toggle (`App.tsx` ~l.975), Settings select (`SettingsDialog.tsx`), saved mode (`ui-state.ts` `liveEventsPanel`, `shared/api.ts` l.67-70, IPC `live-events:mode`) | | Would be dead UI and a dead persisted setting. |
| Tickets tree refresh | `applyLiveEvent` `ticket.changed` -> `refresh()` | **Little for local markdown**: `watch-project.ts` watches `.scratch`, `docs/agents`, skill roots in the main checkout (100 ms debounce); window focus also refreshes (`index.ts` ~l.550). **Real loss for GitHub/GitLab**: writes made by an agent via `dryland` show on the next poll (`tracker-poller.ts`, 60 s) or window focus instead of immediately. Also lost: claims committed from a linked worktree (watcher watches the main checkout only), as it relies on `ticket.changed` or focus. |
| Session badges and states (Sessions view, ticket rows, tabs) | `status.apply` -> `sessions:states` IPC (l.211) -> `SessionBadge`, `SessionsView.tsx`, `TicketsView.tsx`, `shared/sessions-view.ts` | Hook CLIs would show only `launched` and `ended` (spawn/exit). Claude Code and Copilot lose running/waiting/idle. The activity guesser (running/idle, marked approximate) could cover running/idle but never waiting. |
| Waiting count/badge | `App.tsx` l.614, 658 (`liveWaiting`), `MapCounts` (`renderer/src/status.tsx`) | Lost: no "waiting on you" signal anywhere, the main attention feature. |
| Status bar | `App.tsx` l.971-1005: selected-session state text, session counts | State text and counts degrade to launched/ended. The panel toggle button is the events UI. |
| Quit dialog ordering | `shared/quit.ts`, `main/lifecycle.ts` l.133-144 | Waiting-first ordering lost; list still works. |
| Unseen-output badge | `unseen-output.ts` | **Not event-driven** (PTY output). Unaffected. |
| Hand-started CLI adoption | `adoptHandStarted` -> `work.adoptManual` | Sessions started by hand in an app terminal would never be linked to a worktree/ticket. Functional loss, but only for that flow. |
| Next-up ranking and stale claim | `index.ts` `liveSessions()` l.240 -> `readProjectState` -> `core/src/next-step.ts` (waiting l.246, stale-claim l.281-299) | Waiting-first ranking lost. Stale-claim logic only needs "does a live, non-ended session hold this claim", which `launched`/`ended` from spawn/exit already supply. |

## 4. Non-UI needs vs UI-only

### Needed outside the UI

| Need | Depends on events? | Evidence |
| --- | --- | --- |
| Hooks reporting session status | They *are* the senders. If events go, the hooks (`hookSettings`, `statusEvents`, `doctor --install-hooks`, per-CLI hook tests) go or change target. | `core/src/agent-adapter.ts` l.255-305, `core/src/copilot-config.ts`, `cli/test/claude-code-hooks.test.ts`, `copilot-hooks.test.ts` |
| Session status for rule engine | **Yes, but only inside the app.** The engine takes `SessionSnapshot[]` (`next-step.ts` l.25-41); the CLI passes none (`sessions: null`, no stale-claim calls), the app passes `status.states()`. Without events the app can still supply launched/ended. | `index.ts` l.240-247, `repo-snapshot.ts` |
| Claims | **No.** `claimTicket` / `releaseTicket` (`core/src/claim.ts`, `ticket-write.ts`) are file/tracker operations keyed on branch/assignee. Only the *emission* of `ticket.changed` is after-the-fact. | `cli/src/main.ts` l.296-330 |
| Session index (resume, paused) | **Partly.** CLI path: mutating `ticket` commands call `recordAgentSession` using `currentAgentSession` env, with the app closed (ADR 0010). Event path: `session-recording.ts` writes `lastState` (running/waiting/idle) and `lastSeen`, and picks up a new CLI session id after `/clear`. `repo-snapshot.ts` l.72 turns `lastState` into the "paused: was waiting/interrupted" label. | Without events `lastState` is never written, so paused sessions lose "was waiting vs interrupted" and `/clear` ids are not tracked until the next ticket command. |
| Reconcile on start | No. `session-reconcile.ts` rebuilds from tracker, git, Claude history. | `index.ts` l.441-461 |

### UI-only

- Live-events panel, its three modes, toggle, setting and persisted mode.
- Waiting/running/idle badges, map waiting counts, status-bar state text, quit-dialog ordering.
- Instant refresh on GitHub/GitLab (polling covers it, slower) and on worktree-side edits.
- Raw per-event payload display (`describe` in `LiveEventsPanel.tsx`).

## 5. Observations for the "improve, shrink or cut" decision (ticket 06)

- Two jobs share one channel and could be split: **session state** (needs hooks + a listener; valuable) and **`ticket.changed`** (a refresh nudge that the file watcher already covers for local markdown; real only for forge backends and worktree edits).
- If the engine owns tickets (rework positioning), it can refresh itself on its own writes with no channel; `ticket.changed` and the `changed` hook in `COMMANDS` become redundant for any write the app makes itself. Writes by agents in terminals still need a signal, or a watcher on the new store.
- The raw-event panel is the cheapest cut: it is the only user of the full stream, adds a setting, a persisted field, an IPC channel and an e2e spec, and carries no logic.
- Session state is the load-bearing part. Cutting it removes the waiting signal, `lastState`, and the hook install/doctor machinery; the fallback is output-guessing (no waiting detection, marked approximate).
- Coupling to fix if it stays: hooks call the generic `dryland status <kind>` with arbitrary kinds and payloads; `session.started` is accepted but maps to no state; `agent`/`cwd`/`pane` fields exist only for hand-started adoption.
- Lock file plus env pair is a two-path discovery (env first, lock file fallback) mainly to survive terminals outliving the app. A session-only channel could drop the lock-file path if outside terminals do not matter.
- ADR 0008 consequence stands: state is never stored; a closed app means unknown status. Only the index (ADR 0010) survives, and only through the CLI-side ticket commands plus event-fed `lastState`.

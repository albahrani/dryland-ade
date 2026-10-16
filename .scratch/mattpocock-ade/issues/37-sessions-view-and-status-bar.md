# Sessions view panes and status bar

Type: task
Status: resolved
Blocked by: 75

Spec: [spec](../spec.md), user stories 47, 54, 103. "UI", "Sessions, pausing and resuming" (Sessions view layout). Layout detail: `prototype/views-and-ux/index.html?variant=B` and ticket 71's answer.

Rewritten when the paused-sessions build tickets were sliced: the Sessions view is built as split panes from the start. The Paused pane follows in "Paused pane and paused sessions on maps".

## What to build

The Sessions view in the activity bar as split panes, Hidden above Open (Paused will sit between them).

- **Panes**: headers never scroll away; each pane scrolls on its own, collapses to its header and is resized by dragging the sash between panes. Sizes and collapsed state are remembered per project. Header badges: waiting count (gold) before the total.
- **Hidden**: a tree by map, Unlinked last. Map groups start collapsed, groups with waiting sessions sort first, and waiting sessions stay visible under a collapsed group. A group shows `(waiting/total)`, or just the total, with the status breakdown in its tooltip. One-line rows: agent icon with state badge, item title, state and age, an unseen-output dot, Stop on hover.
- **Open**: the open session tabs, two-line rows (title, then the question or last output line), waiting first.
- **Grouping**: the view's "..." menu groups the Hidden tree by Map (default), Agent or None, remembered per project. No grouping by state.
- Selecting a session focuses or reopens its tab and drives the other panes.
- **Status bar**: the selected session's state and branch, and "N open · M hidden (k waiting)". The Sessions activity badge counts live waiting sessions.

## Acceptance criteria

- [x] Every live session appears in Hidden or Open with its current state badge, updating live
- [x] Hidden groups by map with Unlinked last, collapsed by default; waiting sessions float and stay visible under a collapsed group; counts read `(waiting/total)` with the breakdown in the tooltip
- [x] Panes keep their headers in view, scroll separately, collapse, resize, and remember size and collapsed state
- [x] Grouping switches between map, agent and none, and the choice is remembered
- [x] Selecting a session focuses its tab, reopening a hidden one; selecting a ticket with a session selects that session
- [x] The status bar shows the selected session's state and branch and the open and hidden counts; with no session selected, the counts only

## Comments

From mattpocock-ade/75 (1e28cf0): hidden sessions are sessions whose terminalId has no open tab in App.tsx. Show a session with App's showSession (replays TerminalManager.output via terminal:replay, then opens the tab) and stop it with requestStop (asks per stopNeedsConfirmation in shared/stop-session.ts). Unseen output is AppState.unseenSessions, kept current by onUnseenSessions; UnseenMark and LiveSessions are in renderer/src/SessionControls.tsx, ready to reuse for the pane rows.

From mattpocock-ade/75: the spec says a hidden session reopens from a next-up marker too, and that is not built. Today the marker opens the ticket tab, whose Live sessions list has Show session. Make clicking a next-up marker whose step targets a live session (the waiting-session rule) show that session directly with App's showSession, which replays its buffered output into a new tab.

## Answer

Built in 90d69da. Pure logic in packages/desktop/src/shared/sessions-view.ts (split into Hidden/Open, grouping by map/agent/none with waiting groups first and Unlinked last, (waiting/total) counts and state breakdown, selected session, status-bar counts, state ages, saved layout parsing); view in renderer/src/SessionsView.tsx; layout (grouping, collapsed panes, sash share) saved per project in ui-state as sessionsLayout via sessions-layout:save. Decisions: Hidden = live sessions with no tab, Open = every session with a tab, ended included; the selected session is derived from the active tab (session tab, or the most urgent live session of the ticket or map tab), so selecting in the view, a ticket or a tab all drive it; the status bar omits '(k waiting)' when no hidden session waits; group expansion is view-local and not saved; Unlinked holds sessions on no map (new-map sessions). The comment's next-up request is built too: a marker whose step targets a session is a button that shows the session. Known limits: Open's second line is the newest non-empty line of the tab's xterm buffer, not the agent's question (hooks carry no question text); ages count from when this window saw the state change, or the session's start after a reload; ages and last lines refresh once a second only while the Sessions view shows. Tests: test/sessions-view.test.ts, ui-state.test.ts, and the e2e 'lists sessions in the Sessions view...' in e2e/start-work.spec.ts; pnpm test, test:linux, test:e2e and test:e2e:linux all pass.

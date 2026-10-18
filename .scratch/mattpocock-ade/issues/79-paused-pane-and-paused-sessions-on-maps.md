# Paused pane and paused sessions on maps

Type: task
Status: resolved
Blocked by: 37, 77

Spec: [spec](../spec.md), user stories 99, 103. "Sessions, pausing and resuming" (Sessions view layout and the paused-session bullet). Layout detail: `prototype/views-and-ux/index.html?variant=B` and ticket 71's answer.

## What to build

Paused sessions become visible across the views.

- **Paused pane** between Hidden and Open in the Sessions view: the same tree by map and grouping as Hidden. Was-waiting sessions float and stay visible under collapsed groups, groups show `(was waiting/total)`, and rows carry the paused pill ("was waiting", "interrupted", "paused") with its age and Resume on hover. The header badge reads "were waiting" before the total, and the header holds Resume all.
- **Map rows** in the Tickets and Maps views show the map's waiting and paused counts, compact, with the breakdown in the tooltip.
- **Map tab header**: a strip with the map's open, hidden (waiting) and paused counts, a chip per paused item that opens it, and "Resume all on this map".
- **Status bar** adds the paused count: "N open · M hidden (k waiting) · P paused".

## Acceptance criteria

- [x] Every paused session appears in the Paused pane under its map (or agent, or flat, per the grouping), was-waiting first
- [x] Resume on a row resumes that session; Resume all in the header resumes every paused one hidden
- [x] Map rows show waiting and paused counts with the breakdown in the tooltip
- [x] The map tab header lists the counts and the paused items, and resumes that map's paused sessions
- [x] The status bar shows the paused count

## Comments

From mattpocock-ade/37 (90d69da): the Sessions view is packages/desktop/src/renderer/src/SessionsView.tsx; add Paused as a third Pane between Hidden and Open, reusing HiddenRow's shape (Resume in place of Stop) and the same groupSessions tree (shared/sessions-view.ts), which already sorts waiting groups first and Unlinked last. The layout assumes exactly two panes: SessionsLayout.collapsed is keyed by SESSIONS_PANES and the single sash is hiddenShare, so a third pane needs pane sizes as a list (one per pane, two sashes) and parseSessionsLayout must migrate saved hiddenShare values (ui-state sessionsLayout, per project). splitSessions decides Hidden vs Open; paused sessions need their own source since they have no live state. sessionCounts builds the status-bar text and needs the paused count. Group headers use groupCount/stateBreakdown; 'were waiting' needs its own count there.

## Answer

Built in 4540f6d and the follow-up commit: a Paused pane between Hidden and Open (grouped like Hidden, was-waiting first, '(was waiting/total)', pills with age, Resume on hover, header Resume all and 'were waiting' badge); map rows show waiting and paused counts with a tooltip breakdown in the Tickets and Maps views; the map tab has a strip with open/hidden(waiting)/paused counts, a chip per paused item and Resume all on this map; the status bar appends '· P paused' only when P > 0 (existing tests expect the plain form). SessionsLayout now holds per-pane shares with dragSash between adjacent expanded panes; saved hiddenShare layouts migrate. Known limits: the Paused rows reuse groupSessions through a stand-in state map; Resume on a row resumes hidden, without opening a tab.

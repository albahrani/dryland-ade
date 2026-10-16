# Sessions view with many hidden and paused sessions

Type: prototype
Blocked by: 69
Status: resolved

## Question

How should the Sessions view look when a power user has a few open session tabs but dozens of hidden live sessions and paused sessions? Prototype a dense layout: full rows for open sessions, one-line rows for hidden ones grouped by map and collapsed with counts ("Hidden · 23 (2 waiting)"), waiting sessions floated to the top, a collapsed Paused section with "was waiting on you" / "interrupted" labels and Resume / Resume all, and how a ticket and a map show their paused session. Extend prototype/views-and-ux/.

## Answer

Prototyped with the user in prototype/views-and-ux/ (sessions-scale-data.js, sessions-scale.js; open index.html?variant=B), commit bb11eab. Sample data: 4 open session tabs, 31 hidden live sessions (4 waiting), 14 paused over four maps. Three variants: B (sections), C (attention inbox: Needs you / Working / Idle / Paused, visibility as a row attribute), D (wide sortable table behind All/Open/Hidden/Paused tabs with bulk actions). Verdict: B, refined over three rounds.

- Three split panes, Hidden, Paused, Open, in that order. Open goes last because the editor tabs already show open sessions. Headers never scroll away; each pane scrolls on its own, collapses to its header, and is resized by dragging the sash between panes. Plain section headers in one scrolling tree were rejected: they read like tree rows and give no orientation when much is expanded.
- Header badges: waiting count (gold; "were waiting" for Paused) before the total. Paused carries Resume all.
- Hidden and Paused each hold a tree by map (Unlinked last). Map groups start collapsed; groups with waiting sessions sort first; waiting / was-waiting rows stay visible under a collapsed group. Grouping Paused by map came from a simulated quit, which left 44 paused rows in a flat list.
- Map group counts are compact, (waiting/total) in gold and grey, or just the total; the full status breakdown is in the tooltip. Rejected: "Hidden 12 (2 waiting)" text on every group (too long, loud), and W:2 H:12 / ●2 12.
- Rows: one line, agent icon with state badge, title, state or paused pill ("was waiting", "interrupted", "paused") with age; Stop on hover for live rows, Resume for paused, a dot for unseen output. Open rows are two lines (title, then the question or last output), waiting first.
- Paused session on a ticket: pause badge on the agent icon (gold if it was waiting, red if interrupted), a header pill with the label, and in place of the terminal a box with the last transcript line, how to continue, the resume command, and Resume / Pick another session / Start fresh. On a map: ●waiting and paused counts on the map row; the map tab header lists open/hidden/paused counts, the paused items and "Resume all on this map". Status bar: open, hidden (waiting), paused counts. The activity badge counts live waiting sessions.
- Stop pauses the session and keeps the claim (asks when running or unseen). The prototype's "simulate quit and restart" shows restored tabs resuming when first shown.

Recorded in the spec ("Sessions, pausing and resuming": layout and paused-session bullets). Grouping (decided after resolution, with the user): the Sessions view's "..." menu offers Group by Map (default), Agent or None, applied to the trees in Hidden and Paused; Open stays a plain list. Group by State is dropped: the panes already split by state and waiting sessions float to the top. Spec story 47 and ticket 37 updated. The prototype stays on main next to the earlier rounds, because build tickets point at it (rule added to the map's Notes).

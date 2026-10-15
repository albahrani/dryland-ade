# Next-up markers and explanations

Type: task
Status: resolved
Blocked by: 29, 30

Spec: [spec](../spec.md), user stories 26 to 29, 40. "Next-step rule engine", "UI". ADR 0007.

## What to build

Show the rule engine's result in the app. The main process builds the snapshot from the tracker, files and git, runs the engine and sends the ranked next steps to the renderer; it re-runs when the inputs change.

The item a next step points at carries the Next-up marker: a gold bar and a star. The marker sits on a ticket, or on the map itself when only fog remains. Hovering shows the one-sentence "why this next". A details view shows the full explanation: rule, reason, and the evidence read from which artifact and field. On any other ticket the user can ask "why not this?" and gets its unresolved blockers.

## Acceptance criteria

- [x] The top next steps are marked with a gold bar and a star in the Tickets and Maps views
- [x] When a map has only fog left, the marker is on the map, not on a ticket
- [x] Hovering a marked item shows the one-sentence reason
- [x] The full explanation shows rule, reason and evidence, and each evidence entry names the artifact and field
- [x] "Why not this?" on a blocked ticket lists its unresolved blockers; on a ticket with unknown blockers it says "blocking unknown"
- [x] Markers update when a ticket changes on disk
- [x] The same repo state always shows the same markers

## Comments

From the review of 30: readTicketsTree (core, Tickets view) and readRepoSnapshot each scan .scratch and read map.md separately, and findSpecsWithoutTickets scans it a third time. When the main process builds the snapshot here, read efforts and tickets once per refresh through one shared helper and feed both the tree and the snapshot.

## Answer

Built in fa7cc5c. Core: readEfforts (one pass over .scratch) and readProjectState build both the tickets tree and the repo snapshot from one read of tickets and efforts, as the review of 30 asked (readTicketsTree is gone; findSpecsWithoutTickets, CLI only, still scans on its own). nextUpMarkers(steps, count) turns the ranked steps into markers: the first NEXT_UP_COUNT = 3 distinct items, each with its best step. Ticket steps mark the ticket, map and spec steps mark the map, a waiting session marks its ticket, and the repo-level no-setup-config step has no marker. The main process sends markers plus the full ranked list with each project view and recomputes on every watcher or live-event refresh. Desktop: gold bar (inset left edge) and star on Tickets rows and map branches, and on the folded done line when a done ticket is next. The Maps view marks a map only when the map itself is next (story 40). The row tooltip is the one-sentence reason. The ticket or map tab shows rule, command, reason and an evidence table (artifact, field, value). An unmarked open ticket has 'Why not this?': unresolved blockers, 'Blocking unknown', claimed, or its rank below the marked items. The tree now also lists efforts that have only a spec.md, so a spec marker has a row. Known limits: markers re-run on .scratch and docs/agents changes and live ticket events, not on git, ADR or glossary changes. Live sessions are not in the snapshot yet (ticket 65), so the waiting-session marker has nothing feeding it. 'Why not this?' sits in the ticket tab, not on tree rows. Tests: core next-up and project-state, desktop whyNotText, and the e2e next-up.spec.ts.

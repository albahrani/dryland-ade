# Next-up markers and explanations

Type: task
Status: ready-for-agent
Blocked by: 29, 30

Spec: [spec](../spec.md), user stories 26 to 29, 40. "Next-step rule engine", "UI". ADR 0007.

## What to build

Show the rule engine's result in the app. The main process builds the snapshot from the tracker, files and git, runs the engine and sends the ranked next steps to the renderer; it re-runs when the inputs change.

The item a next step points at carries the Next-up marker: a gold bar and a star. The marker sits on a ticket, or on the map itself when only fog remains. Hovering shows the one-sentence "why this next". A details view shows the full explanation: rule, reason, and the evidence read from which artifact and field. On any other ticket the user can ask "why not this?" and gets its unresolved blockers.

## Acceptance criteria

- [ ] The top next steps are marked with a gold bar and a star in the Tickets and Maps views
- [ ] When a map has only fog left, the marker is on the map, not on a ticket
- [ ] Hovering a marked item shows the one-sentence reason
- [ ] The full explanation shows rule, reason and evidence, and each evidence entry names the artifact and field
- [ ] "Why not this?" on a blocked ticket lists its unresolved blockers; on a ticket with unknown blockers it says "blocking unknown"
- [ ] Markers update when a ticket changes on disk
- [ ] The same repo state always shows the same markers

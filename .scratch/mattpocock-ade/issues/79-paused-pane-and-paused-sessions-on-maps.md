# Paused pane and paused sessions on maps

Type: task
Status: ready-for-agent
Blocked by: 37, 77

Spec: [spec](../spec.md), user stories 99, 103. "Sessions, pausing and resuming" (Sessions view layout and the paused-session bullet). Layout detail: `prototype/views-and-ux/index.html?variant=B` and ticket 71's answer.

## What to build

Paused sessions become visible across the views.

- **Paused pane** between Hidden and Open in the Sessions view: the same tree by map and grouping as Hidden. Was-waiting sessions float and stay visible under collapsed groups, groups show `(was waiting/total)`, and rows carry the paused pill ("was waiting", "interrupted", "paused") with its age and Resume on hover. The header badge reads "were waiting" before the total, and the header holds Resume all.
- **Map rows** in the Tickets and Maps views show the map's waiting and paused counts, compact, with the breakdown in the tooltip.
- **Map tab header**: a strip with the map's open, hidden (waiting) and paused counts, a chip per paused item that opens it, and "Resume all on this map".
- **Status bar** adds the paused count: "N open · M hidden (k waiting) · P paused".

## Acceptance criteria

- [ ] Every paused session appears in the Paused pane under its map (or agent, or flat, per the grouping), was-waiting first
- [ ] Resume on a row resumes that session; Resume all in the header resumes every paused one hidden
- [ ] Map rows show waiting and paused counts with the breakdown in the tooltip
- [ ] The map tab header lists the counts and the paused items, and resumes that map's paused sessions
- [ ] The status bar shows the paused count

# Resize the left and right side panels

Type: task
Status: resolved

## Question

The left (tickets) and right side panels have a fixed width. Add a drag handle on the edge of each so the user can resize it, with a sensible minimum and maximum, and keep the width across restarts. Folding the panels is a separate ticket.

## Answer

Drag handles (PanelResizer) on the inner edge of the left and right panels; left 200-640px, right 160-560px (shared/panel-widths.ts), arrow keys also resize. Widths persist in ui-state (panelWidths, global, clamped on read) via the panel-widths:save IPC. Commits fb1043d and the follow-up grid-variable commit. Limits: no drag UI e2e test; widths are not re-clamped when the window shrinks, the editor column keeps a 200px minimum.

# Resize the left and right side panels

Type: task
Status: resolved

## Question

The left (tickets) and right side panels have a fixed width. Add a drag handle on the edge of each so the user can resize it, with a sensible minimum and maximum, and keep the width across restarts. Folding the panels is a separate ticket.

## Answer

Drag handles (PanelResizer) on the inner edge of the left and right panels; left 200-640px, right 160-560px (shared/panel-widths.ts), arrow keys also resize. Widths persist in ui-state (panelWidths, global, clamped on read) via the panel-widths:save IPC. Commits fae2148 and the follow-up grid-variable commit. Limits: no drag UI e2e test; widths are not re-clamped when the window shrinks, the editor column keeps a 200px minimum.

## Comments

Correction to the Answer's Limits line, after b9dd584: a drag e2e test now exists (e2e/panel-resize.spec.ts). On a window too narrow for the saved widths, the panel columns now shrink (minmax(0, width)) so the editor column keeps its 200px minimum and nothing overflows; checked visually at 900px. The saved width is not re-clamped, so the panel returns to it when the window grows. Remaining limit: that last point only.

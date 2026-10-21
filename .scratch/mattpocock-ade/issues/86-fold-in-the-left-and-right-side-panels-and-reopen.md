# Fold in the left and right side panels and reopen them

Type: task
Status: resolved

## Question

Neither side panel can be folded away. Add a way to collapse the left panel and the right panel, and a visible control to open each again once folded (the right one especially has none). Resizing is a separate ticket. Keep the folded state across restarts.

## Answer

Built in 80c7919, 396608c and 8d2b482. The status bar has a Hide/Show left panel and Hide/Show right panel button; folding sets the panel's grid width to 0 and hides the panel and its resize handle with CSS, so the panel stays mounted and its saved width is untouched. The folded state is a global panelFolded setting in ui-state, kept across restarts. Covered by unit tests (panel-widths, ui-state) and e2e/panel-fold.spec.ts, passing natively and in Linux. Known limits: the reopen control lives only in the status bar, not on the panel or activity bar; focus inside a folding panel is not moved.

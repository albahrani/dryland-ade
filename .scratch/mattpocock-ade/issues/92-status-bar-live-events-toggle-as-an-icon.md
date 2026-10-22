# Status bar live events toggle as an icon

Type: task
Status: resolved

## Question

The status bar shows the text Hide live events while the panel is open, though the panel has its own Hide button. Replace the text with a compact icon toggle (with a tooltip and an accessible name) so the status bar wastes less space.

## Answer

The status bar's live events toggle is now a compact pulse-line SVG icon button (class icon-button) with a title tooltip and an aria-label that keeps the old 'Show live events' / 'Hide live events' names, so the existing e2e selectors still work. Commit 7f6b062. Verified by tsc, the live-events e2e and pnpm test; test:linux and the visual look were not checked.

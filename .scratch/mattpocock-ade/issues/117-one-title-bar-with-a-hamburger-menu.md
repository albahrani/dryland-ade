# One title bar with a hamburger menu

Type: task
Blocked by: 116

## Question

Decided in mattpocock-ade/89 (prototype: .scratch/mattpocock-ade/prototype/top-bar/, variant C). Merge the native menu bar and the project bar into one 36 px custom title bar: a hamburger button on the left holding all menus (File, Sessions, View, Help as submenus, plus the File commands inline), then the project widget and tracker widget, a drag region, and the window controls (titleBarOverlay on Windows and Linux; macOS keeps its native menu bar). The dark bar replaces the light native menu on Windows. Menu commands, accelerators and enabled states stay as in buildMenu. Because the Tickets activity icon is the same ☰ glyph, change it to ☑ (checklist) so the two no longer look alike.

## Acceptance criteria

- [ ] The window has one top bar, 36 px, with the hamburger, project widget, tracker widget, drag region and window controls; no separate native menu row on Windows and Linux.
- [ ] The hamburger menu offers every command of today's File, Sessions, View and Help menus, with the same accelerators and enabled states; Escape and outside click close it.
- [ ] The Tickets activity icon is no longer ☰ and is distinguishable from the hamburger.
- [ ] The bar can still drag the window, and the controls minimise, maximise and close it.
- [ ] e2e tests and docs/manual/README.md match.

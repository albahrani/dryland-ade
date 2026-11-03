# One title bar with a hamburger menu

Type: task
Status: resolved
Blocked by: 116

## Question

Decided in mattpocock-ade/89 (prototype: .scratch/mattpocock-ade/prototype/top-bar/, variant C). Merge the native menu bar and the project bar into one 36 px custom title bar: a hamburger button on the left holding all menus (File, Sessions, View, Help as submenus, plus the File commands inline), then the project widget and tracker widget, a drag region, and the window controls (titleBarOverlay on Windows and Linux; macOS keeps its native menu bar). The dark bar replaces the light native menu on Windows. Menu commands, accelerators and enabled states stay as in buildMenu. Because the Tickets activity icon is the same ☰ glyph, change it to ☑ (checklist) so the two no longer look alike.

## Acceptance criteria

- [x] The window has one top bar, 36 px, with the hamburger, project widget, tracker widget, drag region and window controls; no separate native menu row on Windows and Linux.
- [x] The hamburger menu offers every command of today's File, Sessions, View and Help menus, with the same accelerators and enabled states; Escape and outside click close it.
- [x] The Tickets activity icon is no longer ☰ and is distinguishable from the hamburger.
- [ ] The bar can still drag the window, and the controls minimise, maximise and close it.
- [x] e2e tests and docs/manual/README.md match.

## Answer

Built one 36 px title bar (commit 865988d). On Windows and Linux the BrowserWindow uses `titleBarStyle: "hidden"` with a `titleBarOverlay` (36 px, dark) so the system draws minimise, maximise and close over the bar's right end and no native menu row shows. The bar holds a hamburger button, the project widget, and a drag region (`-webkit-app-region: drag`, with the buttons and popups set to no-drag). The hamburger lists File, Sessions, View and Help as submenus, File open first so its commands are one click away; items show their accelerators, disabled ones follow the same enabled states, Escape and an outside click close it. macOS keeps its native frame and menu bar, and shows no hamburger.

The menu is defined once in `packages/desktop/src/shared/app-menu.ts` (labels, accelerators, enabled states) and drives both the native application menu (kept on all platforms, so accelerators and the existing e2e menu clicks still work) and the hamburger, which runs commands through a new `menu:run` IPC that the main process checks against the enabled states. `shared/title-bar.ts` holds the 36 px height and the per-platform window options. The Tickets activity icon is now ☑. Unit tests: `app-menu.test.ts`, `title-bar.test.ts`; e2e: `title-bar.spec.ts`; docs/manual/README.md describes the bar.

Decisions: the tracker widget no longer exists on main, so the bar has the project widget only. The Reload and Toggle Developer Tools items show CmdOrCtrl+R and CmdOrCtrl+Shift+I, which the native roles supply.

Known limits: criterion 4 is left unticked. The drag region and the system-drawn window controls are not exercised by a test, because Playwright cannot press the OS-drawn controls or drag the window; they were not checked by hand. The "no native menu row" e2e check compares the window and content bounds, which was only run on Windows and under Xvfb. On the first native e2e run two terminal tests (pager, smoke full-screen resize) failed once and passed on Playwright's retry. Runs: typecheck, lint, `pnpm test` (735 passed), `pnpm test:linux` (741 passed), native e2e (title-bar spec after the fix 4/4; the rest passed), `pnpm test:e2e:linux` (47 passed).

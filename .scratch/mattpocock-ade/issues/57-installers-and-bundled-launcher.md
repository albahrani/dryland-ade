# Installers and bundled launcher

Type: task
Status: resolved
Blocked by: 33

Spec: [spec](../spec.md), user stories 68, 89, 94. "Modules", "Lifecycle, packaging and release". ADRs 0002, 0004.

## What to build

Dryland as an installable app. `electron-builder` targets: NSIS (Windows x64), DMG (macOS arm64 and x64), AppImage and deb (Linux x64). Unsigned in v1. App id `dev.dryland.ade`; the repo owner stays a placeholder.

The `dryland` CLI is bundled to one JS file and run by the Electron binary in node mode, so it needs no system Node and works with the app closed. A `dryland` launcher ships in the install directory and is replaced on every update. Sessions spawned by the installed app get that launcher on `PATH`.

Putting `dryland` on the user's global `PATH` is opt-in: an NSIS checkbox on Windows, a `dryland doctor` symlink action on macOS/Linux, and the deb's system link.

## Acceptance criteria

- [ ] A build on each OS produces the listed installer formats (verified locally on Windows, in CI for the others)
- [ ] After installing on Windows, the app starts and opens a project
- [x] The installed `dryland` launcher runs with the app closed and on a machine without Node on `PATH`
- [ ] Inside a session of the installed app, `dryland` resolves to the install directory's launcher
- [ ] The NSIS installer offers the global `PATH` option, off by default; with it on, `dryland` works in a new outside terminal
- [x] `dryland doctor` can create and remove the `PATH` symlink on macOS/Linux
- [x] Uninstalling removes the app and the `PATH` entry
- [x] The CLI bundle is a single JS file

## Comments

From ticket 33: until this ticket lands, the app writes the dryland launcher (sh and .cmd) to <userData>/bin at every startup, pointing at out/main/dryland.js, the CLI bundle electron-vite builds beside the main process. It is put first on each session's PATH (packages/desktop/src/main/index.ts and launcher.ts). When the install-directory launcher arrives: point launcherDir at it, stop writing to userData/bin and delete what an earlier version left there, so a stale launcher never shadows the installed one. Check that ELECTRON_RUN_AS_NODE can load the CLI from inside the asar archive, or unpack it.

## Answer

Built in 102c7d9 and 6cbd120. electron-builder (packages/desktop/electron-builder.json, pnpm package) targets NSIS x64, DMG arm64+x64, AppImage and deb, unsigned, app id dev.dryland.ade. The CLI ships as the single file resources/bin/dryland.mjs beside static launchers (installer/bin/dryland, dryland.cmd) that find the app relative to themselves and follow symlinks. An installed app (install-layout.ts) puts userData/bin (Agent CLI shims) then the install bin on session PATH and deletes the stale userData launcher; a dev run is unchanged. Global PATH is opt-in: NSIS page + installer/path.ps1 (unchecked by default, removed by the uninstaller except on update), dryland doctor --link-path/--unlink-path (~/.local/bin/dryland, DRYLAND_LAUNCHER), deb links /usr/bin/dryland and keeps electron-builder's default sandbox/app-link steps. CI gets a package job on three OSes. Verified on Windows: built the NSIS installer, silent install, launcher runs with no node on PATH, app starts and clears the stale launcher, uninstall removes the PATH entry; pnpm test, test:linux and both e2e runs pass. Not verified, left unticked: formats built on macOS/Linux (CI), opening a project in the installed app, the checkbox ticked in the UI and dryland in a new terminal, and dryland resolving to the install launcher inside a real packaged session (layout unit-tested only). Limits: the symlink does not suit an AppImage (temporary mount) and is not removed on app uninstall; dev-mode e2e does not exercise a packaged app.

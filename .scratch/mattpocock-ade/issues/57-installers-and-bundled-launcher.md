# Installers and bundled launcher

Type: task
Status: ready-for-agent
Blocked by: 33

Spec: [spec](../spec.md), user stories 68, 89, 94. "Modules", "Lifecycle, packaging and release". ADRs 0002, 0004.

## What to build

Dryland as an installable app. `electron-builder` targets: NSIS (Windows x64), DMG (macOS arm64 and x64), AppImage and deb (Linux x64). Unsigned in v1. App id `dev.dryland.ade`; the repo owner stays a placeholder.

The `dryland` CLI is bundled to one JS file and run by the Electron binary in node mode, so it needs no system Node and works with the app closed. A `dryland` launcher ships in the install directory and is replaced on every update. Sessions spawned by the installed app get that launcher on `PATH`.

Putting `dryland` on the user's global `PATH` is opt-in: an NSIS checkbox on Windows, a `dryland doctor` symlink action on macOS/Linux, and the deb's system link.

## Acceptance criteria

- [ ] A build on each OS produces the listed installer formats (verified locally on Windows, in CI for the others)
- [ ] After installing on Windows, the app starts and opens a project
- [ ] The installed `dryland` launcher runs with the app closed and on a machine without Node on `PATH`
- [ ] Inside a session of the installed app, `dryland` resolves to the install directory's launcher
- [ ] The NSIS installer offers the global `PATH` option, off by default; with it on, `dryland` works in a new outside terminal
- [ ] `dryland doctor` can create and remove the `PATH` symlink on macOS/Linux
- [ ] Uninstalling removes the app and the `PATH` entry
- [ ] The CLI bundle is a single JS file

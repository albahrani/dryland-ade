# Electron + TypeScript desktop stack, PTYs owned by the app

The ADE is an Electron app written in TypeScript (React renderer, pnpm workspace, `electron-vite`). Agent CLIs run in `node-pty` PTYs rendered by xterm.js (WebGL, fit, unicode11), using native ConPTY on Windows. Tauri was rejected: no bundled Node means no `node-pty`, a rewritten PTY layer, and system webviews that vary per OS. The project is MIT licensed, matching Orca, and may copy small isolated Orca pieces (agent CLI config-table idea, worktree slugify/collision suffixing, ConPTY patches) with the MIT notice and Lovecast Inc. copyright kept in a `THIRD_PARTY_NOTICES` file. Nothing is vendored wholesale and Orca's app shell, relay and mobile code are not used.

## Decisions

- **Pure core package**: the rule engine and the artifact/tracker parsing live in a TypeScript package with no Electron imports, shared by the app and the `ade` CLI.
- **PTY ownership**: PTYs are owned by the Electron main process behind an `IPtyProvider`-style interface. There is no background daemon, and no process outlives the UI. Orca keeps a daemon so sessions survive restarts; we deliberately don't, unless a daemon later solves a concrete roadblock. WSL is a separate PTY backend and is out of v1.
- **`ade` CLI runtime**: one bundled JS file run by the Electron binary in node mode (`ELECTRON_RUN_AS_NODE`), with an `ade` shim on PATH. It needs no system Node and works with the app closed (see ADR 0001).
- **Quitting**: quitting with live sessions shows a confirmation listing them, then kills them. Quit and system-shutdown paths must be fast and leave a consistent state: every `ade` write is already atomic and committed by pathspec (ADR 0001). The ADE additionally releases the claims held by its own sessions, flushes its small local UI state, and does so within the OS shutdown time limit. Anything missed is covered by stale-claim release.
- **ConPTY patches**: Orca's ConPTY pre-warm and teardown patches are ported only as concrete bugs appear.

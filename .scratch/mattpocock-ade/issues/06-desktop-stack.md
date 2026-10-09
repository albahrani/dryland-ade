# Desktop stack and terminal embedding

Type: grilling
Status: resolved
Blocked by: 01

## Question

Choose the desktop stack (Electron vs Tauri vs other), PTY/terminal embedding approach and language(s), so it is platform agnostic (Windows ConPTY, macOS, Linux). Consider what can be taken over from Orca.

## Answer

Settled by grilling; full rationale in [ADR 0002](../../../docs/adr/0002-electron-typescript-desktop-stack.md).

- Electron + React + TypeScript, pnpm workspace, `electron-vite`; pure TS core package (rule engine, artifact/tracker parsing) shared by app and `ade` CLI.
- `node-pty` + xterm.js (WebGL), native ConPTY only; WSL deferred; Orca ConPTY patches ported only when bugs appear.
- Fresh build; small MIT-attributed copies from Orca (`THIRD_PARTY_NOTICES`). The ADE itself is MIT licensed.
- PTYs owned by the main process behind a provider interface; no daemon, nothing outlives the UI.
- `ade` CLI: bundled JS run via the Electron binary in node mode, shim on PATH.
- Quit with live sessions: confirm, then kill; shutdown must be fast and leave a consistent state (own claims released, UI state flushed, stale-claim release as backstop).

# Embedded terminal session

Type: task
Status: resolved
Blocked by: 30

Spec: [spec](../spec.md), user stories 44, 45. "Modules", "Agent adapters". ADR 0002.

## What to build

A real embedded terminal in a session tab. The main process owns PTYs behind a PTY-provider interface (`node-pty`, with Windows ConPTY handling); the renderer shows them with xterm.js. No daemon: no process outlives the app.

For this ticket the session runs the user's default shell in the project's main checkout, started from a plain "new terminal" action. Agent CLIs and worktrees come with the next ticket. The terminal behaves like the user's own: input, output, colours, resize, copy and paste.

ConPTY handling may be copied from Orca with MIT attribution recorded for `THIRD_PARTY_NOTICES`.

## Acceptance criteria

- [x] A session tab runs a shell in which typed commands execute and their output appears
- [ ] Resizing the tab resizes the PTY (a full-screen terminal program redraws correctly)
- [x] Several session tabs run independently
- [x] Closing the app leaves no child process behind
- [x] The PTY provider is an interface with a fake implementation used in tests
- [x] The Playwright smoke test opens a session with a stub shell and sees its output
- [x] Works on Windows; nothing in the design is Windows-only

## Answer

Built in bf833ee. The main process owns PTYs behind a PtyProvider interface (src/main/pty/provider.ts) with a node-pty implementation (ConPTY on Windows) and a FakePty for tests; a TerminalManager (src/main/terminals.ts) maps ids to PTYs, validates sizes, and kills everything on will-quit and when another project is opened. The renderer shows terminals with xterm.js + the fit addon in editor tabs (new ItemRef kind 'terminal', never persisted); a 'New terminal' button opens the default shell (COMSPEC / SHELL, overridable with DRYLAND_SHELL + DRYLAND_SHELL_ARGS, which the Playwright smoke test uses for its stub shell) in the main checkout. Decisions: these are called terminals, not sessions, because GLOSSARY.md reserves Session for an Agent CLI process in a worktree (ticket 33); terminals live in a renderer registry so scrollback survives tab switches. Known limits: the resize criterion is verified by a stub noticing its width change, not by a real full-screen program, so its parenthetical is left unticked; only the shell is killed, not a process tree, beyond what ConPTY/forkpty teardown does; the quit confirmation ADR 0002 describes is ticket 41; no WebGL/unicode11 xterm addons yet; the Playwright smoke test ran on Windows only (unit suite on Windows and Linux).

# Embedded terminal session

Type: task
Status: ready-for-agent
Blocked by: 30

Spec: [spec](../spec.md), user stories 44, 45. "Modules", "Agent adapters". ADR 0002.

## What to build

A real embedded terminal in a session tab. The main process owns PTYs behind a PTY-provider interface (`node-pty`, with Windows ConPTY handling); the renderer shows them with xterm.js. No daemon: no process outlives the app.

For this ticket the session runs the user's default shell in the project's main checkout, started from a plain "new terminal" action. Agent CLIs and worktrees come with the next ticket. The terminal behaves like the user's own: input, output, colours, resize, copy and paste.

ConPTY handling may be copied from Orca with MIT attribution recorded for `THIRD_PARTY_NOTICES`.

## Acceptance criteria

- [ ] A session tab runs a shell in which typed commands execute and their output appears
- [ ] Resizing the tab resizes the PTY (a full-screen terminal program redraws correctly)
- [ ] Several session tabs run independently
- [ ] Closing the app leaves no child process behind
- [ ] The PTY provider is an interface with a fake implementation used in tests
- [ ] The Playwright smoke test opens a session with a stub shell and sees its output
- [ ] Works on Windows; nothing in the design is Windows-only

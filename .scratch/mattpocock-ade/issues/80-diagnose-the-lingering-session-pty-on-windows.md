# Diagnose the lingering session PTY on Windows

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T13:43:08.741Z","was":""}} -->

## Question

On Windows, a session's PTY stays alive well after its Agent CLI has exited. Seen while building mattpocock-ade/41 (bc47448): in the e2e test "quitting with no running session asks nothing" (packages/desktop/e2e/start-work.spec.ts), the fake `claude` fires its SessionEnd hook and calls `process.exit(0)` on `#`. The tab showed "ended" (from the hook's live event), but more than 10 seconds later the quit dialog still listed the session. That means the TerminalManager had not seen the PTY's `onExit`, and `terminals.liveIds()` still held it. Linux does not show this. The quit dialog now leaves out sessions whose CLI reported its end (lifecycle.ts), which hides the symptom there but not elsewhere. Today the tab and ticket badge only stay right because the hook already said "ended". A CLI that exits without the hook (crash, a killed process, an adapter without a session-end hook) would read as live until its PTY finally exits.

Find out what keeps the PTY open, and how long, then fix it or record why it cannot be fixed. Suspects:
- the `cmd.exe /d /c claude.cmd` wrapper Dryland uses for `.cmd` CLIs (programFor in work.ts) outliving the node process
- a process started by the `dryland status` hook staying attached to the console. The fake fires hooks with spawnSync, so the hook itself has returned, but anything it leaves behind would keep ConPTY open
- node-pty's ConPTY exit detection on Windows
Check the real Claude Code too. Its `claude` on Windows may be an `.exe`, not a `.cmd`.

Done when: an Agent CLI that exits on Windows has its PTY's onExit reach the TerminalManager within about a second, with or without its session-end hook. Add an e2e test where the fake CLI exits without firing SessionEnd and the session reads "ended" promptly. Or, if the cause is outside Dryland, record the cause and the measured delay in the answer, and say what Dryland does about it.

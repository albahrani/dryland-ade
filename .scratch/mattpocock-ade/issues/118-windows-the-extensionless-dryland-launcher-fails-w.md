# Windows: the extensionless dryland launcher fails when run from Git Bash, so agent hooks error

Type: task
Status: needs-triage

## Question

Bug. On Windows, every Claude Code hook the ADE installs (`dryland status session.running` on UserPromptSubmit, PreToolUse, PostToolUse, ...) fails with exit 127:

    /t/Dryland ADE/resources/bin/dryland: line 19: /t/Dryland ADE/resources/bin/../../dryland-ade: No such file or directory

Found in the transcript of the ticket 116 session (`/implement 116`, 2026-10-23): a `hook_non_blocking_error` before and after every tool call. The ADE then gets no session status updates, so session indicators are likely wrong. Nothing blocks, so the agent still works.

Cause (observed in the install at `T:\Dryland ADE`): `resources/bin` ships both `dryland` (a `#!/bin/sh` script) and `dryland.cmd`. Claude Code runs hooks through Git Bash, which resolves `dryland` to the sh script, not the `.cmd`. The sh script takes its non-Darwin branch and runs `../../dryland-ade`, the Linux executable name (`executableName` in `electron-builder.json`). On Windows the executable is `Dryland ADE.exe`.

Expected: `dryland status ...` works from a Git Bash hook on Windows, with the app running or closed.

Options to weigh: make the sh launcher detect Windows (`uname` MINGW*/MSYS*/CYGWIN*) and run `Dryland ADE.exe`; or stop shipping the sh launcher on Windows and have the hooks call `dryland.cmd`. Also check `dryland doctor --link-path` and the PATH setup (`path.ps1`) for the same assumption.

## Acceptance criteria

- [x] From Git Bash on Windows, `dryland status session.running` runs the bundled CLI instead of exiting 127.
- [ ] A Claude session opened in the ADE on Windows records no `hook_non_blocking_error` for the dryland hooks.
- [ ] A test or installer check covers the Windows launcher path, so a missing runtime fails the build.

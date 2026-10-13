# Harden dryland doctor tests and tidy its helpers

Type: task
Blocked by: 27

Spec: [spec](../spec.md), user story 88. Leftovers from the review of [dryland doctor basics](27-dryland-doctor-basics.md).
Status: resolved

## What to build

Small follow-ups in `dryland doctor`'s code and tests. Do them before or together with the hooks check in the Copilot CLI adapter ticket, which extends the same code.

- A CLI-level test for the GitHub/GitLab tracker path, with a stub `gh`/`glab` on PATH. Today only core tests cover it, with a faked process runner.
- The CLI test "without dryland on PATH" controls PATH instead of stripping `dryland` entries from the machine's PATH.
- Remove duplication: `exists()` is copied between `core/src/doctor.ts` and `core/src/worktree.ts`, the PATH key lookup repeats in `doctor.ts` and the CLI test helpers, and `formatDoctor` in `cli/src/main.ts` hardcodes the `6 +` indent that matches its `FAIL  ` prefix.

## Acceptance criteria

- [x] `dryland doctor` in a GitHub and a GitLab repo is tested through the CLI for installed, missing and logged-out `gh`/`glab`, asserting output and exit code
- [x] The "dryland is not on PATH" test passes regardless of what the machine's PATH holds
- [x] `exists()` and the PATH key lookup each have one definition
- [x] `formatDoctor` derives its continuation indent from the prefix it prints
- [x] Typecheck, lint, format check and the full suite pass

## Answer

Built in fcc7178. CLI tests now cover gh/glab installed, missing and logged-out via stub executables (POSIX shell script; on Windows a node.exe copy with a NODE_OPTIONS preload). The not-on-PATH test builds PATH from an isolated dir plus git's directory (harness isolatedPath) instead of filtering the machine PATH. exists() and envKey() live once in core/src/env-fs.ts; formatDoctor derives its indent from the prefix. isolatedPath throws if a dryland sits in git's directory (3c42459), so the not-on-PATH test cannot pass by accident. The POSIX stubs were verified on Linux in Docker, which found and fixed a POSIX-only hook test in ticket-claim (c987a90); `pnpm test:linux` repeats that run.

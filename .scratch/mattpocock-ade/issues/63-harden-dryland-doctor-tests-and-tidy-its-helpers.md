# Harden dryland doctor tests and tidy its helpers

Type: task
Blocked by: 27

Spec: [spec](../spec.md), user story 88. Leftovers from the review of [dryland doctor basics](27-dryland-doctor-basics.md).
Status: ready-for-agent

## What to build

Small follow-ups in `dryland doctor`'s code and tests. Do them before or together with the hooks check in the Copilot CLI adapter ticket, which extends the same code.

- A CLI-level test for the GitHub/GitLab tracker path, with a stub `gh`/`glab` on PATH. Today only core tests cover it, with a faked process runner.
- The CLI test "without dryland on PATH" controls PATH instead of stripping `dryland` entries from the machine's PATH.
- Remove duplication: `exists()` is copied between `core/src/doctor.ts` and `core/src/worktree.ts`, the PATH key lookup repeats in `doctor.ts` and the CLI test helpers, and `formatDoctor` in `cli/src/main.ts` hardcodes the `6 +` indent that matches its `FAIL  ` prefix.

## Acceptance criteria

- [ ] `dryland doctor` in a GitHub and a GitLab repo is tested through the CLI for installed, missing and logged-out `gh`/`glab`, asserting output and exit code
- [ ] The "dryland is not on PATH" test passes regardless of what the machine's PATH holds
- [ ] `exists()` and the PATH key lookup each have one definition
- [ ] `formatDoctor` derives its continuation indent from the prefix it prints
- [ ] Typecheck, lint, format check and the full suite pass

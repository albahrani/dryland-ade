# Harden dryland doctor tests and tidy its helpers

Type: task
Blocked by: 27

## Question

Leftovers from the review of [dryland doctor basics](27-dryland-doctor-basics.md), all small and in `dryland doctor`'s code and tests:

- Add a CLI-level test for the GitHub/GitLab tracker path: put a stub `gh`/`glab` on PATH and assert the text output and exit code for installed, missing and logged-out. Today only core tests cover it, with a faked process runner.
- Make the CLI test "without dryland on PATH" independent of the machine: control PATH (node and git directories only) instead of stripping `dryland` entries from the real PATH.
- Dedupe: `exists()` is copied in `core/src/doctor.ts` and `core/src/worktree.ts`, the PATH key lookup is repeated in `doctor.ts` and the CLI test helpers, and `formatDoctor` in `cli/src/main.ts` hardcodes the `6 +` indent that matches its `FAIL  ` prefix.

Do this before or together with the hooks check in the Copilot CLI adapter ticket, which extends the same code.

---
name: implement-parallel
description: "Orchestrate up to 5 Sonnet subagents implementing unblocked tickets in parallel, one git worktree each, then merge and verify main."
disable-model-invocation: true
---

You are the orchestrator: you instruct, inspect and merge; subagents implement. Ask the user about anything you and they cannot settle from the repo; get permission before web research.

**Heavy suites** are `pnpm test:linux`, `pnpm --filter @dryland/desktop test:e2e` (native, opens the app on the user's screen) and `pnpm test:e2e:linux` (invisible, Xvfb). They run only as `node scripts/with-lock.mjs <command>`, one at a time machine-wide. Every other test runs lock-free in parallel.

## Preconditions

Permission mode is accept-edits, with the shell allowlist in `.claude/settings.local.json`. Auto-mode's classifier fails on shell calls here; when shell calls return "no verdict", ask the user to switch mode.

## Wave

1. **Pick.** `node scripts/next-tickets.mjs [map]` lists tickets that are `ready-for-agent` with every `Blocked by` ticket `resolved`. Take up to 5 and say which; one unblocked ticket means one agent.
2. **Worktrees.** Create each yourself: `git worktree add -b ticket-N .claude/worktrees/ticket-N main`. The Agent tool's `isolation: worktree` cuts from stale `origin/main`. Run agents in the background with `model: sonnet`.
3. **Brief** each agent (fill N and the ticket path):

   > Implement ticket N: `<ticket path>`. Work only in `<abs worktree path>` (branch ticket-N), with absolute paths and `git -C`. Follow the ticket's "Read first" list, AGENTS.md and the tdd skill.
   > - Edit files as AGENTS.md "Editing files" says. Run tests as `rtk vitest run <file>` and `rtk tsc`. Hand-edit tickets and maps, as AGENTS.md says.
   > - `.claude/skills/` is absent in your worktree; the skills are in `.agents/skills/<name>/SKILL.md`. Run `pnpm install --offline` first when `node_modules` is missing.
   > - **Tests.** Pick the smallest run that verifies the point you are at (single file, then package) and run it as often as you need to know you are done. Batch first: finish a coherent chunk, fix every known failure, then run once.
   > - **E2E.** Unit and integration tests verify first. Run e2e during development only when `packages/desktop` changed and no lower test can verify the behaviour, as `node scripts/with-lock.mjs pnpm test:e2e:linux e2e/<spec>.spec.ts`, naming only the specs your change touches.
   > - **Final gate.** After everything else is done, reviewed and fixed: `pnpm test`, then the heavy suites (both e2e suites only when `packages/desktop` changed), all green on the final commit, as the last line of defense for the unforeseen. A code change after a green gate re-runs the whole gate. Report done with a green gate.
   > - **Stuck.** After 3 failed attempts at the same failure, or when the ticket and the code disagree, stop and report the blocker with what you tried. Commit a checkpoint with a real message after each coherent chunk.
   > - **Review.** Run code-review (Standards + Spec) against `main..HEAD`; fix real findings.
   > - **Close.** Commit the code on ticket-N, then close the ticket per AGENTS.md "Closing a ticket" as a separate commit. The orchestrator merges and pushes.
   > - **Report:** commits, tests run with pass/fail, review findings and fixes, known limits.

4. **Watch.** A background agent reports only when it ends. While one runs, check `node scripts/wave-status.mjs` now and then (commits, last commit age, diff size, lock owner, containers). Stuck or drifting looks like: no new commit for a long stretch, or a diff far beyond what the ticket's "What to build" names.
5. **Intervene** when an agent reports blocked, loops or drifts: diagnose, then `SendMessage` the fix. For a missing file or stale base, check the worktree base first.

## Merge and verify

Merge finished branches one at a time. Per branch: read the report; confirm the files in `git diff --stat main..ticket-N` fall within the ticket's "What to build"; merge (`--ff-only` when possible, else `git merge --no-edit`); on main run `pnpm install --offline`, `pnpm test`, `pnpm typecheck`, `pnpm lint`. After the wave's last merge run the heavy suites (both e2e suites only when `packages/desktop` changed). Main stays green: fix a failure through a small `fix-N` worktree and agent, or revert the merge.

Once merged, remove the worktree and branch, then delete the directory `git worktree remove` leaves behind (its `node_modules`).

## Review triage

Fix regressions against the ticket's criteria. Report smells and later-ticket gaps to the user as known limits.

## Report to the user

Per ticket: merged commit, main's test results (what ran), known limits. Name the next unblocked tickets and ask before starting the next wave.

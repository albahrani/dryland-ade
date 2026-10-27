---
name: implement-parallel
description: "Orchestrate up to 5 Sonnet subagents implementing unblocked tickets in parallel, one git worktree each, then merge and verify main."
disable-model-invocation: true
---

You are the orchestrator: you instruct, inspect and merge; subagents implement. Keep every brief short and dense. Ask the user about anything you and they cannot settle from the repo; get permission before web research.

## Preconditions

Permission mode is accept-edits, with the shell allowlist in `.claude/settings.local.json`. Auto-mode's classifier fails on shell calls here; if shell calls return "no verdict", ask the user to switch mode.

## Wave

1. **Pick.** `node scripts/next-tickets.mjs [map]` lists tickets that are `ready-for-agent` with every `Blocked by` ticket `resolved`. Take up to 5. Say which; when only one is unblocked, run one.
2. **Worktrees.** You create each: `git worktree add -b ticket-N .claude/worktrees/ticket-N main` (local `main`; the Agent tool's `isolation: worktree` cuts from stale `origin/main`). Agents run in the background with `model: sonnet`.
3. **Brief** each agent (fill N and the ticket path):

   > Implement ticket N: `<ticket path>`. Work ONLY in `<abs worktree path>` (branch ticket-N); absolute paths, `git -C`. Follow the ticket's "Read first" list, AGENTS.md, and the tdd skill.
   > - Change files with Write and Edit; batches and regex replacements with `node scripts/edit.mjs <spec.json>` (spec in the scratchpad directory, never in the repo); deletions with `git rm`. `sed`, `awk`, heredocs and inline scripts are forbidden. `rtk vitest run <file>`, `rtk tsc`. Never run `dryland ticket|map`.
   > - `.claude/skills/` is absent in your worktree; the skills are in `.agents/skills/<name>/SKILL.md`. Run `pnpm install --offline` first if `node_modules` is missing.
   > - Tests: run whatever verifies the point you are at, as often as needed (single files, then packages), so you know when you are done. Every run is a verification with a purpose; pick the smallest that serves it. The final full-suite run is the last line of defense for the unforeseen: run `pnpm test` at least once at the end, then the heavy suites as the final quality gate.
   > - Heavy suites run only through the lock: `node scripts/with-lock.mjs pnpm test:linux`, `node scripts/with-lock.mjs pnpm --filter @dryland/desktop test:e2e`, `node scripts/with-lock.mjs pnpm test:e2e:linux`. All other tests run lock-free in parallel.
   > - E2E is the most expensive check; unit and integration tests verify first. Native e2e opens the app on the user's screen, so use it only for the final gate. During development, an e2e run (only when `packages/desktop` changed and no lower test can verify the behaviour) is `node scripts/with-lock.mjs pnpm test:e2e:linux e2e/<spec>.spec.ts`: invisible (Xvfb), faster, only the specs your change touches. Batch first: finish a coherent chunk and fix every known failure, then run once, never once per small edit.
   > - Final gate, once everything else is done and reviewed (review fixes included): one full native e2e and one full `test:e2e:linux`, both green on the final commit. Any code change after a green run means both full runs again. Do not report done without them.
   > - Stuck: after 3 failed attempts at the same failure, or when the ticket and the code disagree, stop and report the blocker with what you tried; do not keep trying. Commit a checkpoint with a real message after each coherent chunk.
   > - Code-review (Standards + Spec) against `main..HEAD` is mandatory; fix real findings, re-test.
   > - Commit the code on ticket-N. Close the ticket per AGENTS.md "Closing a ticket" as a separate commit. Do not merge or push.
   > - Report: commits, tests run with pass/fail, review findings and fixes, known limits.

4. **Watch.** A background agent cannot ask mid-run; it reports only when it ends. While one runs, check `node scripts/wave-status.mjs` now and then (commits, last commit age, diff size, lock owner, containers) against the ticket's scope. No new commits for a long stretch, or a diff far beyond the ticket, means stuck or drifting.
5. **Intervene** when an agent reports blocked, loops, or drifts from its ticket: diagnose, then `SendMessage` the fix. If it names a missing file or stale base, check the worktree base first.

## Merge and verify

Per finished branch, one at a time: read the report, check `git diff --stat main..ticket-N` matches the ticket, then merge (`--ff-only` when possible, else `git merge --no-edit`). After each merge run `pnpm install --offline`, `pnpm test`, `pnpm typecheck`, `pnpm lint` on main. After the wave's last merge run `pnpm test:linux`, and for `packages/desktop` changes both e2e suites (through `scripts/with-lock.mjs`). Remove the worktree and branch once merged.

Failures on main: fix through a small `fix-N` worktree and agent, or revert the merge; never leave main red.

## Review triage

Fix regressions against the ticket's criteria. Leave smells and later-ticket gaps as noted limits in the report to the user.

## Report to the user

Per ticket: merged commit, main's test results (what ran), known limits. Name the next unblocked tickets and ask before starting the next wave.

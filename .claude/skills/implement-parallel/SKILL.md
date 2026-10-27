---
name: implement-parallel
description: "Orchestrate up to 5 Sonnet subagents implementing unblocked tickets in parallel, one git worktree each, then merge and verify main."
disable-model-invocation: true
---

You are the orchestrator: you instruct, inspect and merge; subagents implement. Keep every brief short and dense. Ask the user about anything you and they cannot settle from the repo; get permission before web research.

## Preconditions

Permission mode is accept-edits or an allowlist for `git`, `pnpm`, `rtk`, `docker`. Auto-mode's classifier fails on shell calls here; if shell calls return "no verdict", ask the user to switch mode.

## Wave

1. **Pick.** From the tracker (`docs/agents/issue-tracker.md`; tickets in `.scratch/*/issues/`) take up to 5 tickets with `Status: ready-for-agent` whose every `Blocked by` ticket is `resolved`. Say which and why; when only one is unblocked, run one.
2. **Worktrees.** You create each: `git worktree add -b ticket-N .claude/worktrees/ticket-N main` (local `main`; the Agent tool's `isolation: worktree` cuts from stale `origin/main`). Agents run in the background with `model: sonnet`.
3. **Brief** each agent (fill N and the ticket path):

   > Implement ticket N: `<ticket path>`. Work ONLY in `<abs worktree path>` (branch ticket-N); absolute paths, `git -C`. Follow the ticket's "Read first" list, AGENTS.md, and the tdd skill.
   > - Write/Edit only for files; no heredocs or inline scripts. `rtk vitest run <file>`, `rtk tsc`. Never run `dryland ticket|map`.
   > - Run unit and integration tests, including `pnpm test`, as often as useful. Only `pnpm test:linux`, `pnpm --filter @dryland/desktop test:e2e` and `pnpm test:e2e:linux` take the lock: `mkdir T:/Development/.test-lock` (retry every 30s), `rmdir` after, release on failure too. Run those once before finishing. Run `pnpm install --offline` first if `node_modules` is missing.
   > - Code-review (Standards + Spec) against `main..HEAD` is mandatory; fix real findings, re-test.
   > - Commit the code on ticket-N. Close the ticket per AGENTS.md "Closing a ticket" as a separate commit. Do not merge or push.
   > - Report: commits, tests run with pass/fail, review findings and fixes, known limits.

4. **Intervene** when an agent reports blocked, loops, or drifts from its ticket: diagnose, then `SendMessage` the fix. If it names a missing file or stale base, check the worktree base first.

## Merge and verify

Per finished branch, one at a time: read the report, check `git diff --stat main..ticket-N` matches the ticket, then merge (`--ff-only` when possible, else `git merge --no-edit`). After each merge run `pnpm install --offline`, `pnpm test`, `pnpm typecheck`, `pnpm lint` on main. After the wave's last merge run `pnpm test:linux`, and for `packages/desktop` changes both e2e suites (take the lock). Remove the worktree and branch once merged.

Failures on main: fix through a small `fix-N` worktree and agent, or revert the merge; never leave main red.

## Review triage

Fix regressions against the ticket's criteria. Leave smells and later-ticket gaps as noted limits in the report to the user.

## Report to the user

Per ticket: merged commit, main's test results (what ran), known limits. Name the next unblocked tickets and ask before starting the next wave.

# Workspace and `dryland ticket list`

Type: task
Status: ready-for-agent

Spec: [spec](../spec.md), user stories 8, 25, 59, 67, 68. ADRs 0001, 0002, 0008.

## What to build

The first tracer bullet through the whole stack: a pnpm workspace under the `@dryland` scope with the three packages (core, cli, and a desktop package that is only a stub for now), Vitest, and the test harness that runs the real `dryland` command against a temp git repo.

On top of that, one working command: `dryland ticket list`. It reads which tracker the repo uses from `docs/agents/issue-tracker.md`, finds the main checkout from any worktree through git's common dir, parses the local-markdown ticket files in their default skill format, and prints the tickets. Default output is short plain text written for agents; `--json` gives the same data for the app.

External processes are reached through one process-runner interface in core, so later tickets can fake `gh` and `glab`.

## Acceptance criteria

- [ ] `pnpm install`, typecheck, lint and `pnpm test` work from the repo root
- [ ] core has no Electron imports
- [ ] `dryland ticket list` in a temp repo with local-markdown tickets prints id, title, type and state per ticket, and `--json` returns the same as structured data
- [ ] Run from a linked worktree, it lists the tickets of the main checkout, not the worktree's copy
- [ ] In a repo whose tracker doc is missing or names an unsupported tracker, it exits non-zero and states the next action
- [ ] Ticket files are parsed with fixtures taken from this repo's real `.scratch` tickets
- [ ] The CLI test harness (temp git repo, run command, assert stdout, exit code, files and git log) is reusable by later tickets

# CI on three OSes

Type: task
Status: resolved
Blocked by: 20

Spec: [spec](../spec.md), "Lifecycle, packaging and release". ADR 0004. Details in the resolved [GitHub project preparation ticket](18-github-project-preparation.md).

## What to build

A GitHub Actions `ci` workflow that runs typecheck, lint and Vitest on Windows, macOS and Linux for every push and pull request. Actions are pinned by commit SHA, `permissions` are minimal and only `GITHUB_TOKEN` is used. Dependabot is configured for npm and Actions.

The Playwright smoke job (Windows only) is added by the desktop shell ticket, not here.

## Acceptance criteria

- [x] The workflow runs typecheck, lint and Vitest on all three OSes
- [x] Every action is pinned to a commit SHA and the workflow declares minimal `permissions`
- [x] No secret other than `GITHUB_TOKEN` is referenced
- [x] Dependabot config covers npm and GitHub Actions
- [x] The workflow file passes a local lint (for example `actionlint`) since the repo has no remote yet

## Answer

Implemented in 6a21e45. `.github/workflows/ci.yml` runs `pnpm typecheck`, `pnpm lint` and `pnpm test` on ubuntu, windows and macos for every push and pull request, with `contents: read` permissions, no secret beyond the implicit token, and every action pinned to a commit SHA (checked to exist upstream: checkout, pnpm/action-setup, setup-node). `.github/dependabot.yml` covers npm and github-actions weekly. The workflow passes `actionlint` v1.7.7, run locally via `go run` because the repo has no remote yet. Not yet exercised on real runners, since there is no remote.

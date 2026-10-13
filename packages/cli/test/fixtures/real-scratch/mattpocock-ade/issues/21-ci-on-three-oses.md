# CI on three OSes

Type: task
Status: ready-for-agent
Blocked by: 20

Spec: [spec](../spec.md), "Lifecycle, packaging and release". ADR 0004. Details in the resolved [GitHub project preparation ticket](18-github-project-preparation.md).

## What to build

A GitHub Actions `ci` workflow that runs typecheck, lint and Vitest on Windows, macOS and Linux for every push and pull request. Actions are pinned by commit SHA, `permissions` are minimal and only `GITHUB_TOKEN` is used. Dependabot is configured for npm and Actions.

The Playwright smoke job (Windows only) is added by the desktop shell ticket, not here.

## Acceptance criteria

- [ ] The workflow runs typecheck, lint and Vitest on all three OSes
- [ ] Every action is pinned to a commit SHA and the workflow declares minimal `permissions`
- [ ] No secret other than `GITHUB_TOKEN` is referenced
- [ ] Dependabot config covers npm and GitHub Actions
- [ ] The workflow file passes a local lint (for example `actionlint`) since the repo has no remote yet

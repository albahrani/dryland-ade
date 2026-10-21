# Contributing to Dryland ADE

Thank you for helping. Dryland is an unofficial, community-made project, so a small, focused change that is easy to review is the best kind.

## Set up

You need Node 26 (see `.node-version`) and pnpm 10.

```sh
pnpm install
pnpm build
```

`pnpm build` bundles the `dryland` CLI to `packages/cli/dist/dryland.mjs`. Run the desktop app with `pnpm --filter @dryland/desktop dev`.

## Before you open a PR

Run these; CI runs them on Linux, macOS and Windows.

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

If you touched `packages/desktop`, also run the Playwright tests: `pnpm --filter @dryland/desktop test:e2e`.

On Windows, a POSIX-only failure (executable bits, `#!/bin/sh` stubs) can hide from a local run. With Docker running, `pnpm test:linux` runs the suite in a Linux container, and `pnpm test:e2e:linux` does the same for the Playwright tests.

## How the work is organised

- Work is tracked as local markdown tickets under `.scratch/<map>/issues/`, described in `docs/agents/issue-tracker.md`. Change tickets and map indexes through the `dryland` CLI, not by editing the files.
- Behaviour is test-first: write the failing test, then the code. Prefer testing at a seam (the process runner, the Agent adapter, the rule engine) over mocking internals.
- Use the words in `GLOSSARY.md`. When you coin a term or change what one means, update the glossary in the same PR.
- A decision that is hard to reverse or would surprise a reader belongs in an ADR under `docs/adr/`. Say in the PR whether your change touches one.
- `THIRD_PARTY_NOTICES.md` is generated: run `node scripts/third-party-notices.mjs` after you change a dependency. CI fails when it is out of date.
- Code copied from another project must keep its licence and be attributed in the generator's `ORCA_COPIES` list or, for other projects, in the notices.

## Commits and PRs

Keep commits small and say why in the message. Fill in the PR template. Do not commit secrets, personal paths or tokens.

## Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems as described in [SECURITY.md](SECURITY.md), not in a public issue.

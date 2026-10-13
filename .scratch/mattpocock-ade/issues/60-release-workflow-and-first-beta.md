# Release workflow and first beta

Type: task
Status: ready-for-human
Blocked by: 21, 57, 59

Spec: [spec](../spec.md), user story 89. "Lifecycle, packaging and release". ADR 0004. Details in the resolved [GitHub project preparation ticket](18-github-project-preparation.md).

## What to build

The path from this local repo to a first public release. It needs a human because it creates the GitHub repo, rewrites history and publishes.

An agent can prepare:

- the `release` workflow on `v*` tags: three-OS `electron-builder` matrix, draft release, pre-release for `-beta.N` tags, SHA-pinned, minimal `permissions`
- a secrets and personal-data scan of history and files (tokens, personal paths, emails), with a report

The human does:

- choose the repo owner, and fill it into the app id's publish config
- review the scan report, then squash to one "Initial commit" and push
- set the repo description and topics, branch protection on `main` (CI required, no force-push), private vulnerability reporting, Discussions off
- tag `v0.1.0-beta.1` and publish the draft release to the `beta` channel

## Acceptance criteria

- [ ] The release workflow builds all installers from a `v*` tag and attaches them to a draft release; a `-beta.N` tag is marked pre-release
- [ ] The scan report is reviewed and nothing sensitive remains in the pushed history
- [ ] The repo `dryland-ade` exists with one initial commit, description, topics and the listed settings
- [ ] `ci` is green on the pushed repo on all three OSes
- [ ] `v0.1.0-beta.1` is published and its Windows installer installs and starts
- [ ] An installed beta finds the release on the `beta` channel

## Comments

From the review of 30: the Windows e2e smoke job (packages/desktop, 'e2e (windows-latest)' in ci.yml) has never run on GitHub. Add an acceptance line here: the e2e job is green on the pushed repo; then tick the last criterion of ticket 30 (Playwright smoke passes on Windows and runs in CI). Watch for: Electron binary download, pnpm onlyBuiltDependencies, pnpm/action-setup.

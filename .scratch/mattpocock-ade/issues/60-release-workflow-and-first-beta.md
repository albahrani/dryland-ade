# Release workflow and first beta

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T14:59:35.768Z","was":"ready-for-human"}} -->
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

Agent part done. The release workflow is .github/workflows/release.yml (20b5781): on a v* tag it builds Windows, macOS and Linux installers with electron-builder and uploads them to a draft release; a tag with a prerelease suffix is marked pre-release in a final job; the version comes from the tag; it fails early if publish.owner and publish.repo in packages/desktop/electron-builder.json differ from the repository it runs in. Checked: actionlint is clean, and a local Windows build with the version override produced dryland-ade-0.1.0-beta.1-win-x64.exe with latest.yml (electron-updater falls back to latest.yml for a beta tag, so the beta channel needs no beta.yml). The scan report is research/first-push-scan-report.md: gitleaks found nothing in 437 commits and no personal data remains in the current tree. Human steps left: the owner choice, the two decisions in the report, the read-through of .scratch, the squash and push, repo settings, the tag, publishing the draft. No criterion is ticked yet; all need the pushed repo.

Decision by the maintainer, replacing the squash in this ticket's body and in acceptance criterion 3 (and the First push line of ticket 18): the full history is pushed as it is, with no squash. Why: resolved tickets cite commit hashes in their Answers (77 ticket files do), so a squash or any rewrite would leave those references dangling and cut the history of the tracker and of git unevenly. The scan found nothing that needs removing: no secrets, no personal email, authors are a GitHub noreply address; the only trace of the Windows account name is a test fixture in two commits (2ff5d79, 414aadd), neutralised in the second, which is accepted. Criterion 3 therefore reads: the repo dryland-ade exists with the full history, description, topics and the listed settings.

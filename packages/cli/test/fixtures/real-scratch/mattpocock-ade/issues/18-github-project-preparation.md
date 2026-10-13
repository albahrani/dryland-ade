# GitHub project preparation and release checklist

Type: grilling
Status: resolved
Blocked by: 16

## Question

What must be in place before the project is uploaded to GitHub and v1 is released, so nothing is forgotten? Cover: README and user manual; LICENSE (MIT), THIRD_PARTY_NOTICES, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY; issue/PR templates; CI (tests plus release build); release process incl. the beta channel (see ADR 0004); repo name, description and topics; first-push cleanup (history review, what to do with .scratch).

## Answer

- **Repo**: `dryland-ade` (owner placeholder until upload; only `appId` and the updater `publish` config need it). Description: "Unofficial, community-made desktop ADE for repos using Matt Pocock's skills." Topics: `ade`, `agent-development-environment`, `claude-code`, `github-copilot-cli`, `electron`, `typescript`, `matt-pocock-skills`.
- **First push**: scan history and files for secrets, personal paths, emails and tokens (gitleaks or grep), then squash to one "Initial commit".
- **Layout**: nothing moves. `.scratch/`, `docs/adr/`, `docs/agents/`, `GLOSSARY.md`, `AGENTS.md`, `.agents/` and `skills-lock.json` stay where the skills and tracker docs expect them; spec goes to `.scratch/mattpocock-ade/spec.md`, ADRs to `docs/adr/`. `.scratch` stays committed as dogfooded design history and parser-fixture source; the README says so. User manual is new, in `docs/manual/`.
- **Files**: `LICENSE` (MIT, "Dryland ADE contributors"), `THIRD_PARTY_NOTICES.md` (Orca attribution plus bundled licenses, generated in CI), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` (private vulnerability reporting), `README.md` (install, unsigned-build workarounds, unofficial/non-affiliation disclaimer and agent-CLI terms reminder), `CHANGELOG.md`.
- **Templates**: issue forms for bug (with `dryland doctor` output), feature request, skill-setup compatibility report; PR template checklist (tests, ADR impact, glossary). Default labels only.
- **CI** (GitHub Actions, SHA-pinned, minimal `permissions`, only `GITHUB_TOKEN`): `ci` (typecheck, lint, Vitest on Win/macOS/Linux; Playwright smoke Windows only); `release` on `v*` tags (3-OS electron-builder matrix, draft release, pre-release for `-beta.N`); license-notice up-to-date check.
- **Release**: SemVer; `v0.1.0-beta.1` first public release to the `beta` channel; `v1.0.0` to `latest` only after the manual smoke checklist passes on Windows (real GitHub/GitLab, Claude/Copilot interactive trust prompt, install/uninstall, beta→latest auto-update). Manual tagging, hand-edited `CHANGELOG.md`.
- **Repo settings**: branch protection on `main` (CI required, no force-push), private vulnerability reporting, Discussions off, Dependabot for npm and Actions.

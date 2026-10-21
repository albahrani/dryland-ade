# OSS files, README, manual and About

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-21T07:36:02.018Z","was":"ready-for-agent"}} -->
Blocked by: 30

Spec: [spec](../spec.md), user stories 90, 95. "Product shape and constraints", "UI". Details in the resolved [GitHub project preparation ticket](18-github-project-preparation.md).

## What to build

Everything a visitor and a contributor expect in the repo, and the wording that keeps affiliation clear.

- `LICENSE` (MIT, "Dryland ADE contributors"), `THIRD_PARTY_NOTICES.md` (Orca attribution for the copied pieces plus bundled licences, generated, with a CI check that it is up to date), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` (private vulnerability reporting), `CHANGELOG.md`.
- `README.md`: what Dryland is, install, the documented workarounds for unsigned builds (SmartScreen, Gatekeeper), the "unofficial, community-made" statement with credit to Matt Pocock's skills, a reminder to check the Agent CLI terms, and a note that `.scratch` is committed as dogfooded design history.
- A user manual under `docs/manual/`, covering what exists at the time and structured so later features slot in.
- Issue forms (bug with `dryland doctor` output, feature request, skill-setup compatibility report) and a PR template checklist (tests, ADR impact, glossary).
- The About dialog and tagline in the app state "unofficial, community-made" and credit Matt Pocock's skills. No Waterworld imagery.

Nothing moves: skill-expected paths stay where they are.

## Acceptance criteria

- [ ] All listed files exist with real content, not placeholders
- [ ] The README states non-affiliation and credits Matt Pocock's skills, and so does the About dialog
- [ ] The README documents how to get past SmartScreen and Gatekeeper for unsigned builds
- [ ] `THIRD_PARTY_NOTICES.md` is generated and a CI check fails when it is out of date
- [ ] Every piece copied from Orca so far is attributed
- [ ] Issue forms and the PR template are present and valid
- [ ] The manual covers opening a project, the views, starting work and the `dryland` CLI
